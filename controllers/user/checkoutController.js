
const Address = require('../../models/addressSchema');
const Cart = require('../../models/cartSchema');
const  Orders = require('../../models/orderSchema')


// Validate cart on page load
exports.validateCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const cart = await Cart.findOne({ user: userId }).populate('cartItem.productId');

    if (!cart || !cart.cartItem || cart.cartItem.length === 0) {
      return res.status(200).json({ success: true, message: 'Cart is empty or not found' });
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
        console.log(`Invalid productId for cart item ${item._id}: product not found`);
        invalidProducts.push('Unknown product (product not found)');
      } else if (typeof item.productId.totalStock === 'undefined' || item.quantity > item.productId.totalStock) {
        console.log(`Insufficient stock for product ${item.productId.productName}: Requested ${item.quantity}, Available ${item.productId.totalStock}`);
        invalidProducts.push(item.productId.productName);
      } else if (item.productId.isAvailable === false) {
        console.log(`Product ${item.productId.productName} is marked as unavailable`);
        invalidProducts.push(item.productId.productName);
      } else {
        validItems.push(item);
      }
    }

    if (invalidProducts.length > 0) {
      cart.cartItem = validItems;
      cart.cartTotal = validItems.reduce((total, item) => total + item.total, 0);
      await cart.save();
      console.log('Removed invalid items from cart during validation:', invalidProducts);
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
    const cart = await Cart.findOne({ user: userId }).populate('cartItem.productId');

    if (!cart || !cart.cartItem || cart.cartItem.length === 0) {
      console.log('Cart is empty or not found for user:', userId);
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
        console.log(`Invalid productId for cart item ${item._id}: product not found`);
        invalidProducts.push('Unknown product (product not found)');
      } else if (typeof item.productId.totalStock === 'undefined' || item.quantity > item.productId.totalStock) {
        console.log(`Insufficient stock for product ${item.productId.productName}: Requested ${item.quantity}, Available ${item.productId.totalStock}`);
        invalidProducts.push(item.productId.productName);
      } else if (item.productId.isAvailable === false) {
        console.log(`Product ${item.productId.productName} is marked as unavailable`);
        invalidProducts.push(item.productId.productName);
      } else {
        validItems.push(item);
      }
    }

    if (invalidProducts.length > 0) {
      cart.cartItem = validItems;
      cart.cartTotal = validItems.reduce((total, item) => total + item.total, 0);
      await cart.save();
      console.log('Removed invalid items from cart during checkout:', invalidProducts);

      return res.status(400).json({
        valid: false,
        message: 'Some products in your cart are unavailable or out of stock.',
        invalidProducts,
      });
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

    // Fetch cart
    const cart = await Cart.findOne({ user: userId }).populate('cartItem.productId');
    if (!cart || !cart.cartItem || cart.cartItem.length === 0) {
      return res.redirect('/cart');
    }

    // Fetch user addresses
    const userAddresses = await Address.find({ userId });
  console.log("adress>>>>",userAddresses)

    // Calculate totals
    let originalSubtotal = 0;
    cart.cartItem.forEach(item => {
      if (item.productId && item.productId.price) {
        originalSubtotal += item.productId.price * item.quantity;
      }
    });

    // Apply 20% discount for orders above ₹5000
    let discountAmount = 0;
    if (originalSubtotal > 5000) {
      discountAmount = originalSubtotal * 0.2; // 20% discount
    }

    // Add shipping charge
    const shippingCharge = 100;

    // Calculate final price
    const finalPrice = originalSubtotal - discountAmount + shippingCharge;

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
      shippingCharge,
      finalPrice,
      addressRequired,
      selectedAddressId,
      userId,
    });
  } catch (error) {
    console.error('Error rendering checkout page:', error);
    req.flash('error_msg', 'An error occurred while loading the checkout page.');
    res.redirect('/cart');
  }
};

//Handle address selection
exports.selectAddress = async(req,res)=>{
  try{
    const userId = req.user.id;
    const {addressId} = req.body;

    if(!addressId){
      return res.status(400).json({success:false, message:'Address ID is required'})
    }
    //verify the address belongs to the user
    const address = await Address.findOne({_id:addressId, userId})
    if(!address){
      return res.status (404).json({success:false, message:'Address not found or does not belong to user'})
    }
    //update all address to remove default status
    await Address.updateMany({userId},{$set:{isDefault:false}})

    //set the selected address as default 
    await Address.findByIdAndUpdate(addressId,{$set:{isDefault:true}})

    
    console.log(`Address ${addressId} set as default for user ${userId}`);
    return res.status(200).json({ success: true, message: 'Address updated successfully' });
  } catch (error) {
    console.error('Error selecting address:', error);
    return res.status(500).json({ success: false, message: 'An error occurred while updating the address' });
  }
}

// Function to generate a unique order number
const generateOrderNumber = () => {
  const timestamp = Date.now();
  const random = Math.floor(1000 + Math.random() * 9000); // 4-digit random number
  return `ORD-${timestamp}-${random}`;
};

// Render the placing order page for COD
exports.getPlacingOrder = async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch cart
    const cart = await Cart.findOne({ user: userId }).populate('cartItem.productId');
    if (!cart || !cart.cartItem || cart.cartItem.length === 0) {
      req.flash('error_msg', 'Your cart is empty. Please add items to proceed.');
      return res.redirect('/cart');
    }

    // Fetch default address
    const defaultAddress = await Address.findOne({ userId, isDefault: true });
    if (!defaultAddress) {
      req.flash('error_msg', 'Please select a delivery address.');
      return res.redirect('/checkout');
    }

    // Fetch all user addresses (for potential future use)
    const userAddresses = await Address.find({ userId });

    // Calculate totals
    let originalSubtotal = 0;
    cart.cartItem.forEach(item => {
      if (item.productId && item.productId.price) {
        originalSubtotal += item.productId.price * item.quantity;
      }
    });

    // Apply 20% discount for orders above ₹5000
    let discountAmount = 0;
    if (originalSubtotal > 5000) {
      discountAmount = originalSubtotal * 0.2; // 20% discount
    }

    // Add shipping charge
    const shippingCharge = 100;

    // Calculate final price
    const finalPrice = originalSubtotal - discountAmount + shippingCharge;

    // Render placing order page with default address
    res.render('user/placingorder', {
      cartItems: cart.cartItem,
      userAddresses,
      defaultAddress, // Pass the selected address
      originalSubtotal,
      discountAmount,
      shippingCharge,
      finalPrice,
      addressRequired: userAddresses.length === 0,
      selectedAddressId: defaultAddress._id.toString(),
      userId,
    });
  } catch (error) {
    console.error('Error rendering placing order page:', error);
    req.flash('error_msg', 'An error occurred while loading the payment page.');
    res.redirect('/cart');
  }
};

// Handle COD order placement
exports.placeOrder = async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch cart
    const cart = await Cart.findOne({ user: userId }).populate('cartItem.productId');
    if (!cart || !cart.cartItem || cart.cartItem.length === 0) {
      req.flash('error_msg', 'Your cart is empty. Please add items to proceed.');
      return res.redirect('/cart');
    }

    // Fetch default address
    const defaultAddress = await Address.findOne({ userId, isDefault: true });
    if (!defaultAddress) {
      req.flash('error_msg', 'Please select a delivery address.');
      return res.redirect('/checkout');
    }

    // Calculate totals
    let originalSubtotal = 0;
    const orderedItem = cart.cartItem.map(item => {
      if (item.productId && item.productId.price) {
        const productPrice = item.productId.price;
        const quantity = item.quantity;
        const totalProductPrice = productPrice * quantity;
        originalSubtotal += totalProductPrice;
        return {
          productId: item.productId._id,
          quantity,
          productPrice,
          finalProductPrice: productPrice, // Assuming no per-item discount
          totalProductPrice,
          finalTotalProductPrice: totalProductPrice, // Assuming no per-item discount
          productStatus: 'Pending',
        };
      }
    }).filter(item => item); // Remove any undefined items

    // Apply 20% discount for orders above ₹5000
    let discountAmount = 0;
    if (originalSubtotal > 5000) {
      discountAmount = originalSubtotal * 0.2; // 20% discount
    }

    // Add shipping charge
    const shippingCharge = 100;

    // Calculate final amount
    const finalAmount = originalSubtotal - discountAmount + shippingCharge;

    // Generate unique order number
    const orderNumber = generateOrderNumber();

    // Create new order
    const order = new Orders({
      userId,
      cartId: cart._id,
      deliveryAddress: defaultAddress._id,
      orderNumber,
      orderedItem,
      orderAmount: originalSubtotal,
      discountAmount,
      finalAmount,
      paymentMethod: 'Cash on Delivery',
      paymentStatus: 'Pending',
      orderStatus: 'Pending',
      razorpayOrderId: null,
    });

    await order.save();

    // Clear the cart
    cart.cartItem = [];
    cart.cartTotal = 0;
    await cart.save();

    // Redirect to order confirmation page
    res.redirect(`/confirmorder/${order._id}`);
  } catch (error) {
    console.error('Error placing order:', error);
    req.flash('error_msg', 'An error occurred while placing your order.');
    res.redirect('/checkout');
  }
};

// Render order confirmation page (basic implementation)
exports.getOrderConfirmation = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const order = await Orders.findById(orderId)
      .populate('orderedItem.productId deliveryAddress');
    if (!order) {
      req.flash('error_msg', 'Order not found.');
      return res.redirect('/cart');
    }
    res.render('user/confirmorder', { order });
  } catch (error) {
    console.error('Error rendering order confirmation:', error);
    req.flash('error_msg', 'An error occurred.');
    res.redirect('/cart');
  }
};