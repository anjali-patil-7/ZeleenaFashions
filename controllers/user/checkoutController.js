const Address = require('../../models/addressSchema');
const Cart = require('../../models/cartSchema');
const Orders = require('../../models/orderSchema');
const Coupon = require('../../models/couponSchema');
const User = require('../../models/userSchema');

// Validate cart on page load
exports.validateCart = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(`Validating cart for user: ${userId}`);
    const cart = await Cart.findOne({ user: userId }).populate('cartItem.productId');

    if (!cart || !cart.cartItem || cart.cartItem.length === 0) {
      console.log(`Cart not found or empty for user: ${userId}`);
      return res.status(200).json({ success: true, message: 'Cart is empty or not found', invalidProducts: [] });
    }

    const validItems = [];
    const invalidProducts = [];

    for (const item of cart.cartItem) {
      console.log('Validating cart item:', {
        itemId: item._id,
        productId: item.productId ? item.productId._id : 'null',
        productName: item.productId ? item.productId.productName : 'null',
        quantity: item.quantity,
        stockInCart: item.stock,
        stockInProduct: item.productId ? item.productId.totalStock : 'null',
      });

      if (!item.productId) {
        console.log(`Skipping item ${item._id}: Product not found`);
        invalidProducts.push('Unknown product (product not found)');
        continue;
      }
      if (typeof item.productId.totalStock === 'undefined' || item.quantity > item.productId.totalStock) {
        console.log(`Skipping item ${item._id}: Insufficient stock for ${item.productId.productName}`);
        invalidProducts.push(item.productId.productName);
        continue;
      }
      if (item.productId.isAvailable === false) {
        console.log(`Skipping item ${item._id}: ${item.productId.productName} is unavailable`);
        invalidProducts.push(item.productId.productName);
        continue;
      }
      validItems.push(item);
    }

    if (invalidProducts.length > 0) {
      console.log(`Invalid products found: ${invalidProducts.join(', ')}`);
      cart.cartItem = validItems;
      cart.cartTotal = validItems.reduce((total, item) => total + item.total, 0);
      await cart.save();
      console.log('Updated cart after validation:', cart.cartItem);
    }

    res.status(200).json({ success: true, invalidProducts });
  } catch (error) {
    console.error('Error validating cart:', error);
    res.status(500).json({ success: false, message: 'Error validating cart' });
  }
};

// Verifying cart before rendering checkout page
exports.verifyCartBeforeCheckout = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(`Verifying cart for checkout, user: ${userId}`);
    const cart = await Cart.findOne({ user: userId }).populate('cartItem.productId');

    if (!cart || !cart.cartItem || cart.cartItem.length === 0) {
      console.log(`Cart is empty or not found for user: ${userId}`);
      return res.status(400).json({
        valid: false,
        message: 'Your cart is empty. Please add items to proceed to checkout.',
      });
    }

    const invalidProducts = [];
    const validItems = [];

    for (const item of cart.cartItem) {
      console.log('Inspecting cart item for checkout:', {
        itemId: item._id,
        productId: item.productId ? item.productId._id : 'null',
        productName: item.productId ? item.productId.productName : 'null',
        quantity: item.quantity,
        stockInCart: item.stock,
        stockInProduct: item.productId ? item.productId.totalStock : 'null',
      });

      if (!item.productId) {
        console.log(`Skipping item ${item._id}: Product not found`);
        invalidProducts.push('Unknown product (product not found)');
        continue;
      }
      if (typeof item.productId.totalStock === 'undefined' || item.quantity > item.productId.totalStock) {
        console.log(`Skipping item ${item._id}: Insufficient stock for ${item.productId.productName}`);
        invalidProducts.push(item.productId.productName);
        continue;
      }
      if (item.productId.isAvailable === false) {
        console.log(`Skipping item ${item._id}: ${item.productId.productName} is unavailable`);
        invalidProducts.push(item.productId.productName);
        continue;
      }
      validItems.push(item);
    }

    if (validItems.length === 0) {
      console.log(`All products invalid during checkout: ${invalidProducts.join(', ')}`);
      cart.cartItem = [];
      cart.cartTotal = 0;
      await cart.save();
      return res.status(400).json({
        valid: false,
        message: `All products in your cart are unavailable or out of stock: ${invalidProducts.join(', ')}`,
        invalidProducts,
      });
    }

    if (invalidProducts.length > 0) {
      console.log(`Invalid products found during checkout: ${invalidProducts.join(', ')}`);
      cart.cartItem = validItems;
      cart.cartTotal = validItems.reduce((total, item) => total + item.total, 0);
      await cart.save();
      console.log('Updated cart after removing invalid items:', cart.cartItem);
    }

    console.log('Cart verification successful for user:', userId);
    return res.status(200).json({ valid: true });
  } catch (error) {
    console.error('Error verifying cart:', error);
    return res.status(500).json({
      valid: false,
      message: 'An error occurred while verifying your cart. Please try again.',
    });
  }
};

// Render checkout page
exports.getCheckoutPage = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(`Rendering checkout page for user: ${userId}`);

    // Fetch cart
    const cart = await Cart.findOne({ user: userId }).populate('cartItem.productId');
    if (!cart || !cart.cartItem || cart.cartItem.length === 0) {
      req.flash('error_msg', 'Your cart is empty.');
      return res.redirect('/cart');
    }

    // Validate products
    const invalidProducts = cart.cartItem.filter(item => !item.productId).map(item => 'Unknown product');
    if (invalidProducts.length === cart.cartItem.length) {
      console.log('All cart items are invalid:', invalidProducts);
      cart.cartItem = [];
      cart.cartTotal = 0;
      await cart.save();
      req.flash('error_msg', 'All products in your cart are invalid or unavailable.');
      return res.redirect('/cart');
    }

    // Fetch user addresses
    const userAddresses = await Address.find({ userId });

    // If there’s only one address and it’s not default, set it as default
    if (userAddresses.length === 1 && !userAddresses[0].isDefault) {
      await Address.findByIdAndUpdate(userAddresses[0]._id, { $set: { isDefault: true } });
      userAddresses[0].isDefault = true;
      console.log(`Set single address ${userAddresses[0]._id} as default for user ${userId}`);
    }

    // Fetch user for wallet balance
    const user = await User.findById(userId);
    const walletBalance = user.wallet ? user.wallet.balance : 0;

    // Calculate cart totals
    let originalSubtotal = 0;
    cart.cartItem.forEach(item => {
      if (item.productId && item.productId.price) {
        originalSubtotal += item.productId.price * item.quantity;
      }
    });

    // Fetch applied coupon from session or database
    let appliedCoupon = null;
    let couponDiscount = 0;
    if (req.session.appliedCoupon) {
      appliedCoupon = await Coupon.findOne({ code: req.session.appliedCoupon });
      if (appliedCoupon) {
        if (appliedCoupon.discountType === 'percentage') {
          couponDiscount = (originalSubtotal * appliedCoupon.discount) / 100;
          if (appliedCoupon.maxDiscount && couponDiscount > appliedCoupon.maxDiscount) {
            couponDiscount = appliedCoupon.maxDiscount;
          }
        } else {
          couponDiscount = appliedCoupon.discount;
        }
        if (appliedCoupon.minPurchase && originalSubtotal < appliedCoupon.minPurchase) {
          appliedCoupon = null;
          couponDiscount = 0;
          req.session.appliedCoupon = null;
        }
      } else {
        req.session.appliedCoupon = null;
      }
    }

    // Fetch available coupons
    const availableCoupons = await Coupon.find({
      isActive: true,
      expiryDate: { $gte: new Date() },
      minPurchase: { $lte: originalSubtotal },
    });

    // Apply 20% discount for orders above ₹5000
    let discountAmount = 0;
    if (originalSubtotal > 5000) {
      discountAmount = originalSubtotal * 0.2;
    }

    // Add shipping charge
    const shippingCharge = 100;

    // Calculate final price
    const finalPrice = originalSubtotal - discountAmount - couponDiscount + shippingCharge;

    // Determine if address is required
    const addressRequired = userAddresses.length === 0;

    // Select default address or first available
    let selectedAddressId = null;
    if (userAddresses.length > 0) {
      const defaultAddress = userAddresses.find(addr => addr.isDefault === true);
      selectedAddressId = defaultAddress ? defaultAddress._id.toString() : userAddresses[0]._id.toString();
    }

    // Render checkout page
    res.render('user/checkout', {
      cartItems: cart.cartItem,
      userAddresses,
      originalSubtotal,
      discountAmount,
      couponDiscount,
      shippingCharge,
      finalPrice,
      addressRequired,
      selectedAddressId,
      userId,
      appliedCoupon,
      availableCoupons,
      walletBalance,
      user: req.user || {},
    });
  } catch (error) {
    console.error('Error rendering checkout page:', error);
    req.flash('error_msg', 'An error occurred while loading the checkout page.');
    res.redirect('/cart');
  }
};

// Handle address selection
exports.selectAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { addressId } = req.body;

    if (!addressId) {
      return res.status(400).json({ success: false, message: 'Address ID is required' });
    }
    const address = await Address.findOne({ _id: addressId, userId });
    if (!address) {
      return res.status(404).json({ success: false, message: 'Address not found or does not belong to user' });
    }
    await Address.updateMany({ userId }, { $set: { isDefault: false } });
    await Address.findByIdAndUpdate(addressId, { $set: { isDefault: true } });

    console.log(`Address ${addressId} set as default for user ${userId}`);
    return res.status(200).json({ success: true, message: 'Address updated successfully' });
  } catch (error) {
    console.error('Error selecting address:', error);
    return res.status(500).json({ success: false, message: 'An error occurred while updating the address' });
  }
};

// Handle coupon application and removal
exports.applyCoupon = async (req, res) => {
  try {
    const { couponCode, action } = req.body;
    const userId = req.user.id;

    const cart = await Cart.findOne({ user: userId }).populate('cartItem.productId');
    if (!cart || !cart.cartItem || cart.cartItem.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    let originalSubtotal = 0;
    cart.cartItem.forEach(item => {
      if (item.productId && item.productId.price) {
        originalSubtotal += item.productId.price * item.quantity;
      }
    });

    if (action === 'apply') {
      if (!couponCode) {
        return res.status(400).json({ success: false, message: 'Coupon code is required' });
      }

      const coupon = await Coupon.findOne({
        code: couponCode,
        isActive: true,
        expiryDate: { $gte: new Date() },
      });

      if (!coupon) {
        return res.status(400).json({ success: false, message: 'Invalid or expired coupon' });
      }

      // Check if user has already used this coupon
      const hasUsedCoupon = coupon.usedBy.some(entry => entry.userId.toString() === userId.toString());
      if (hasUsedCoupon) {
        return res.status(400).json({
          success: false,
          message: 'You have already used this coupon.',
        });
      }

      // Check if maxRedeem limit is reached
      if (coupon.usedBy.length >= coupon.maxRedeem) {
        return res.status(400).json({
          success: false,
          message: 'This coupon has reached its maximum redemption limit.',
        });
      }

      if (coupon.minPurchase && originalSubtotal < coupon.minPurchase) {
        return res.status(400).json({
          success: false,
          message: `Minimum purchase of ₹${coupon.minPurchase} required for this coupon`,
        });
      }

      let couponDiscount = 0;
      if (coupon.discountType === 'percentage') {
        couponDiscount = (originalSubtotal * coupon.discount) / 100;
        if (coupon.maxDiscount && couponDiscount > coupon.maxDiscount) {
          couponDiscount = coupon.maxDiscount;
        }
      } else {
        couponDiscount = coupon.discount;
      }

      let discountAmount = originalSubtotal > 5000 ? originalSubtotal * 0.2 : 0;
      const shippingCharge = 100;
      const finalPrice = originalSubtotal - discountAmount - couponDiscount + shippingCharge;

      req.session.appliedCoupon = couponCode;

      return res.status(200).json({
        success: true,
        message: 'Coupon applied successfully',
        couponCode,
        couponDiscount: couponDiscount.toFixed(2),
        finalPrice: finalPrice.toFixed(2),
      });
    } else if (action === 'remove') {
      req.session.appliedCoupon = null;

      let discountAmount = originalSubtotal > 5000 ? originalSubtotal * 0.2 : 0;
      const shippingCharge = 100;
      const finalPrice = originalSubtotal - discountAmount + shippingCharge;

      return res.status(200).json({
        success: true,
        message: 'Coupon removed successfully',
        finalPrice: finalPrice.toFixed(2),
      });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }
  } catch (error) {
    console.error('Error applying/removing coupon:', error);
    return res.status(500).json({ success: false, message: 'An error occurred while processing the coupon' });
  }
};

// Render order confirmation page
exports.getOrderConfirmation = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const order = await Orders.findById(orderId)
      .populate('orderedItem.productId deliveryAddress');
    if (!order) {
      console.log(`Order not found: ${orderId}`);
      req.flash('error_msg', 'Order not found.');
      return res.redirect('/cart');
    }
    res.render('user/confirmorder', { order });
  } catch (error) {
    console.error('Error rendering order confirmation:', error);
    req.flash('error_msg', 'An error occurred while loading the order confirmation page.');
    res.redirect('/cart');
  }
};

// Redirect /placingorder to checkout
exports.getPlacingOrder = async (req, res) => {
  req.flash('error_msg', 'Please select a payment method on the checkout page.');
  res.redirect('/checkout');
};

// Remove coupon
exports.removeCoupon = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(`Removing coupon for user: ${userId}`);

    // Remove coupon from session
    req.session.appliedCoupon = null;

    // Recalculate cart totals
    const cart = await Cart.findOne({ user: userId }).populate('cartItem.productId');
    if (!cart || !cart.cartItem || cart.cartItem.length === 0) {
      return res.json({
        success: true,
        message: 'Coupon removed successfully, cart is empty',
      });
    }

    let originalSubtotal = 0;
    cart.cartItem.forEach(item => {
      if (item.productId && item.productId.price) {
        originalSubtotal += item.productId.price * item.quantity;
      }
    });

    let discountAmount = originalSubtotal > 5000 ? originalSubtotal * 0.2 : 0;
    const shippingCharge = 100;
    const finalPrice = originalSubtotal - discountAmount + shippingCharge;

    res.json({
      success: true,
      message: 'Coupon removed successfully',
      finalPrice: finalPrice.toFixed(2),
    });
  } catch (error) {
    console.error('Error removing coupon:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove coupon',
    });
  }
};