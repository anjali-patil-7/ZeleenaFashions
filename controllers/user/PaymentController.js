const Orders = require('../../models/orderSchema');
const Cart = require('../../models/cartSchema');
const Coupon = require('../../models/couponSchema');
const Wallet = require('../../models/walletSchema');
const Product = require('../../models/productSchema');
const Address = require('../../models/addressSchema');
const Razorpay = require('razorpay');
const crypto = require('crypto');



// Initialize Razorpay instance
const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Helper function to calculate final amount
const calculateFinalAmount = async (userId, couponCode) => {
  try {
    const cart = await Cart.findOne({ user: userId }).populate('cartItem.productId');
    if (!cart || !cart.cartItem.length) {
      throw new Error('Cart is empty');
    }

    let subtotal = 0;
    let discountAmount = 0;
    let couponDiscount = 0;

    // Calculate subtotal and product-specific discounts
    cart.cartItem.forEach(item => {
      if (!item.productId) return;
      let itemPrice = item.productId.price;

      // Apply product-specific offer if available
      if (item.productId.offer && item.productId.offer.discount) {
        discountAmount += (itemPrice * item.quantity * item.productId.offer.discount) / 100;
        itemPrice = itemPrice * (1 - item.productId.offer.discount / 100);
      }

      subtotal += itemPrice * item.quantity;
    });

    // Apply 20% discount for orders above ₹5000
    if (subtotal > 5000) {
      discountAmount += subtotal * 0.2;
    }

    // Apply coupon if provided
    if (couponCode) {
      const coupon = await Coupon.findOne({
        code: couponCode,
        status: true,
        expiry: { $gte: new Date() },
      });

      if (coupon) {
        if (coupon.minimumPrice && subtotal < coupon.minimumPrice) {
          throw new Error(`Minimum purchase of ₹${coupon.minimumPrice} required for this coupon`);
        }

        if (coupon.discountType === 'percentage') {
          couponDiscount = (subtotal * coupon.discount) / 100;
          if (coupon.maxDiscount && couponDiscount > coupon.maxDiscount) {
            couponDiscount = coupon.maxDiscount;
          }
        } else {
          couponDiscount = coupon.discount;
        }
      } else {
        throw new Error('Invalid or expired coupon');
      }
    }

    // Add shipping charge
    const shippingCharge = 100;
    const finalAmount = subtotal - discountAmount - couponDiscount + shippingCharge;

    return finalAmount;
  } catch (error) {
    console.error('Error calculating final amount:', error);
    throw error;
  }
};

// Helper function to create order
const createOrder = async (userId, addressId, paymentMethod, couponCode, additionalFields = {}) => {
  try {
    console.log("creatingorder..",userId)
    const cart = await Cart.findOne({ user: userId }).populate('cartItem.productId');
    if (!cart || !cart.cartItem.length) {
      throw new Error('Cart is empty');
    }

    // Validate address
    const address = await Address.findOne({ _id: addressId, userId });
    if (!address) {
      throw new Error('Invalid address selected');
    }

    // Validate stock
    for (const item of cart.cartItem) {
      if (!item.productId) {
        throw new Error(`Product not found for item ${item._id}`);
      }
      if (item.quantity > item.productId.totalStock) {
        throw new Error(`Insufficient stock for ${item.productId.productName}`);
      }
      if (!item.productId.status) {
        throw new Error(`${item.productId.productName} is unavailable`);
      }
    }

    // Calculate totals
    let subtotal = 0;
    let discountAmount = 0;
    let couponDiscount = 0;

    cart.cartItem.forEach(item => {
      if (!item.productId) return;
      let itemPrice = item.productId.price;

      // Apply product-specific offer
      if (item.productId.offer && item.productId.offer.discount) {
        discountAmount += (itemPrice * item.quantity * item.productId.offer.discount) / 100;
        itemPrice = itemPrice * (1 - item.productId.offer.discount / 100);
      }

      subtotal += itemPrice * item.quantity;
    });

    // Apply 20% discount for orders above ₹5000
    if (subtotal > 5000) {
      discountAmount += subtotal * 0.2;
    }

    // Apply coupon if provided
    let couponId = null;
    if (couponCode) {
      const coupon = await Coupon.findOne({
        code: couponCode,
        status: true,
        expiry: { $gte: new Date() },
      });

      if (coupon) {
        if (coupon.minimumPrice && subtotal < coupon.minimumPrice) {
          throw new Error(`Minimum purchase of ₹${coupon.minimumPrice} required for this coupon`);
        }

        // Check if user has used the coupon
        const hasUsedCoupon = coupon.usedBy.some(entry => entry.userId.toString() === userId.toString());
        if (hasUsedCoupon) {
          throw new Error('You have already used this coupon');
        }

        // Check maxRedeem
        if (coupon.usedBy.length >= coupon.maxRedeem) {
          throw new Error('This coupon has reached its maximum redemption limit');
        }

        if (coupon.discountType === 'percentage') {
          couponDiscount = (subtotal * coupon.discount) / 100;
          if (coupon.maxDiscount && couponDiscount > coupon.maxDiscount) {
            couponDiscount = coupon.maxDiscount;
          }
        } else {
          couponDiscount = coupon.discount;
        }
        couponId = coupon._id;
      } else {
        throw new Error('Invalid or expired coupon');
      }
    }

    // Add shipping charge
    const shippingCharge = 100;
    const finalAmount = subtotal - discountAmount - couponDiscount + shippingCharge;

    // Create order
    const order = new Orders({
      userId,
      cartId: cart._id,
      deliveryAddress: addressId,
      orderNumber: `ORD_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      orderedItem: cart.cartItem.map(item => ({
        productId: item.productId._id,
        quantity: item.quantity,
        productPrice: item.productId.price,
        finalProductPrice: item.price || item.productId.price,
        totalProductPrice: item.productId.price * item.quantity,
        finalTotalProductPrice: item.total || (item.productId.price * item.quantity),
        productStatus: 'Pending',
        refunded: false,
        returnApproved: false,
      })),
      orderAmount: subtotal,
      discountAmount,
      couponDiscount,
      couponCode: couponCode || null,
      couponApplied: couponId || null,
      shippingCharge,
      finalAmount,
      paymentMethod,
      orderStatus: additionalFields.paymentStatus === 'Paid' ? 'Confirmed' : 'Pending',
      ...additionalFields,
    });

    await order.save();

    // Update coupon usedBy
    if (couponId) {
      await Coupon.findByIdAndUpdate(couponId, {
        $push: {
          usedBy: {
            userId,
            usedAt: new Date(),
            orderId: order._id,
          },
        },
      });
    }

    // Update product stock
    for (const item of cart.cartItem) {
      await Product.findByIdAndUpdate(item.productId._id, {
        $inc: { totalStock: -item.quantity },
      });
    }

    return order;
  } catch (error) {
    console.error('Error creating order:', error);
    throw error;
  }
};

// Place order (for COD and Wallet)
exports.placeOrder = async (req, res) => {
  try {
    const { addressId, paymentMethod, couponCode } = req.body;
    const userId = req.session.user.id;
    

    // Validate address
    const address = await Address.findOne({ _id: addressId, userId });
    if (!address) {
      return res.status(400).json({
        success: false,
        message: 'Invalid address selected',
      });
    }

    // Fetch cart
    const cart = await Cart.findOne({ user: userId }).populate('cartItem.productId');
    if (!cart || !cart.cartItem.length) {
      console.log('Cart is empty or not found');
      return res.status(400).json({
        success: false,
        message: 'Cart is empty',
      });
    }

    // Calculate final amount
    const finalAmount = await calculateFinalAmount(userId, couponCode);

    // Validate COD for orders above ₹3000
    if (paymentMethod === 'cod' && finalAmount > 3000) {
      return res.status(400).json({
        success: false,
        message: 'Cash on Delivery is not available for orders above ₹3000.',
      });
    }

    let paymentStatus = 'Pending';
    if (paymentMethod === 'wallet') {
      const wallet = await Wallet.findOne({ userId });
      if (!wallet || wallet.balance < finalAmount) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient wallet balance',
        });
      }

      // Deduct from wallet
      await Wallet.findOneAndUpdate(
        { userId },
        {
          $inc: { balance: -finalAmount },
          $push: {
            transaction: {
              amount: -finalAmount,
              transactionsMethod: 'Payment',
              description: `Order payment for order_${Date.now()}`,
              date: new Date(),
            },
          },
        }
      );

      paymentStatus = 'Paid';
    }

    // Create order
    const order = await createOrder(userId, addressId, paymentMethod, couponCode, {
      paymentStatus,
    });

    // Clear cart
    await Cart.findOneAndUpdate(
      { user: userId },
      { $set: { cartItem: [], cartTotal: 0 } }
    );

    res.json({
      success: true,
      redirectUrl: `/confirmorder/${order._id}`,
      orderId: order._id,
    });
  } catch (error) {
    console.error('Error placing order:', error);
    res.status(500).json({
      success: false,
      message: error.message.includes('Insufficient stock')
        ? 'Some products are out of stock. Please check your cart.'
        : error.message || 'Failed to place order',
    });
  }
};

// Create Razorpay order
exports.createRazorpayOrder = async (req, res) => {
  try {
    const { addressId, paymentMethod, couponCode } = req.body;
    const userId = req.session.user.id;
    console.log('Creating Razorpay order for user:', userId);

    // Validate address
    const address = await Address.findOne({ _id: addressId, userId });
    if (!address) {
      return res.status(400).json({
        success: false,
        message: 'Invalid address selected',
      });
    }

    // Fetch cart details
    const cart = await Cart.findOne({ user: userId }).populate('cartItem.productId');
    if (!cart || !cart.cartItem.length) {
      console.log('Cart is empty or not found');
      return res.status(400).json({
        success: false,
        message: 'Cart is empty',
      });
    }

    // Calculate final amount
    const finalAmount = await calculateFinalAmount(userId, couponCode);

    // Create Razorpay order
    const options = {
      amount: Math.round(finalAmount * 100), // Convert to paise
      currency: 'INR',
      receipt: `order_${Date.now()}`,
    };

    const razorpayOrder = await razorpayInstance.orders.create(options);
    console.log('Razorpay order created:', razorpayOrder.id);

    res.json({
      success: true,
      order_id: razorpayOrder.id,
      amount: options.amount,
      currency: options.currency,
      key_id: process.env.RAZORPAY_KEY_ID || '',
      customer_name: req.user.name,
      customer_email: req.user.email,
      customer_phone: req.user.mobile,
    });
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create payment order',
    });
  }
};

// Verify Razorpay payment
exports.verifyPayment = async (req, res) => {
  try {
    const {
      addressId,
      paymentMethod,
      couponCode,
      razorpayPaymentId,
      razorpayOrderId,
      razorpaySignature,
      orderId,
    } = req.body;

     const userId = req.session.user.id;

    // Validate required fields
    if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
      console.log('Missing required payment fields:', { razorpayPaymentId, razorpayOrderId, razorpaySignature });
      return res.status(400).json({
        success: false,
        message: 'Missing required payment details',
        redirectUrl: '/orders',
        orderId,
      });
    }

    // Validate RAZORPAY_KEY_SECRET
    if (!process.env.RAZORPAY_KEY_SECRET) {
      console.error('RAZORPAY_KEY_SECRET is not set in environment variables');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error: Missing Razorpay Key Secret',
        redirectUrl: '/orders',
        orderId,
      });
    }

    // If orderId is provided (retry payment), fetch order instead of cart
    let cart, order;
    if (orderId) {
      order = await Orders.findById(orderId);
      if (!order) {
        console.log('Order not found:', orderId);
        return res.status(400).json({
          success: false,
          message: 'Order not found',
          redirectUrl: '/orders',
          orderId,
        });
      }
      if (order.paymentStatus !== 'Failed') {
        console.log('Order is not in Failed status:', order.paymentStatus);
        return res.status(400).json({
          success: false,
          message: 'Order is not eligible for retry payment',
          redirectUrl: '/orders',
          orderId,
        });
      }
    } else {
      cart = await Cart.findOne({ user: userId }).populate(
        "cartItem.productId"
      );
      if (!cart || !cart.cartItem.length) {
        console.log('Cart is empty or not found');
        return res.status(400).json({
          success: false,
          message: 'Cart is empty',
          redirectUrl: '/orders',
        });
      }
    }

    // Verify Razorpay signature
    const body = razorpayOrderId + '|' + razorpayPaymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpaySignature) {
      console.log('Invalid Razorpay signature:', { expectedSignature, razorpaySignature });
      if (orderId) {
        // Update existing order
        order.paymentStatus = 'Failed';
        order.paymentId = razorpayPaymentId;
        order.razorpayOrderId = razorpayOrderId;
        await order.save();
      } else {
        // Create new order with failed payment
        const newOrder = await createOrder(userId, addressId, paymentMethod, couponCode, {
          paymentId: razorpayPaymentId,
          razorpayOrderId,
          paymentStatus: 'Failed',
        });

        // Clear cart
        await Cart.findOneAndUpdate(
          { user: userId },
          { $set: { cartItem: [], cartTotal: 0 } }
        );

        return res.status(400).json({
          success: false,
          message: 'Invalid payment signature',
          redirectUrl: '/orders',
          orderId: newOrder._id,
        });
      }

      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature',
        redirectUrl: '/orders',
        orderId,
      });
    }

    // Success: Update or create order
    if (orderId) {
      // Update existing order for retry payment
      order.paymentStatus = 'Paid';
      order.paymentId = razorpayPaymentId;
      order.razorpayOrderId = razorpayOrderId;
      order.orderStatus = 'Pending';
      await order.save();

      console.log('Retry payment successful for order:', orderId);
      return res.json({
        success: true,
        redirectUrl: `/confirmorder/${order._id}`,
        orderId: order._id,
      });
    } else {
      // Create new order for initial payment
      const newOrder = await createOrder(
        userId,
        addressId,
        paymentMethod,
        couponCode,
        {
          paymentId: razorpayPaymentId,
          razorpayOrderId,
          paymentStatus: "Paid",
        }
      );

      console.log('Verifying payment:', {
      orderId,
      razorpayOrderId,
      razorpayPaymentId,
      addressId,
      paymentMethod,
      couponCode,
    });

      // Clear cart
      await Cart.findOneAndUpdate(
        { user: userId },
        { $set: { cartItem: [], cartTotal: 0 } }
      );

      console.log('Initial payment successful for order:', newOrder._id);
      return res.json({
        success: true,
        redirectUrl: `/confirmorder/${newOrder._id}`,
        orderId: newOrder._id,
      });
    }
  } catch (error) {
    console.error('Error verifying payment:', {
      message: error.message,
      stack: error.stack,
      orderId: req.body.orderId,
      razorpayPaymentId: req.body.razorpayPaymentId,
      razorpayOrderId: req.body.razorpayOrderId,
    });

    const { addressId, paymentMethod, couponCode, razorpayPaymentId, razorpayOrderId, orderId } = req.body;

    if (orderId) {
      // Update existing order
      const order = await Orders.findById(orderId);
      if (order) {
        order.paymentStatus = 'Failed';
        order.paymentId = razorpayPaymentId || null;
        order.razorpayOrderId = razorpayOrderId || null;
        await order.save();
        console.log('Order updated to Failed:', orderId);
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to verify payment: ' + error.message,
        redirectUrl: '/orders',
        orderId,
      });
    } else {
      // Create new order with failed status
      const cart = await Cart.findOne({ user: req.session.user.id }).populate('cartItem.productId');
      if (cart && cart.cartItem.length) {
        const newOrder = await createOrder(req.session.user.id, addressId, paymentMethod, couponCode, {
          paymentId: razorpayPaymentId || null,
          razorpayOrderId: razorpayOrderId || null,
          paymentStatus: 'Failed',
        });

        // Clear cart
        await Cart.findOneAndUpdate(
          { user: req.session.user.id },
          { $set: { cartItem: [], cartTotal: 0 } }
        );

        console.log('New order created with Failed status:', newOrder._id);
        return res.status(500).json({
          success: false,
          message: 'Failed to verify payment: ' + error.message,
          redirectUrl: '/orders',
          orderId: newOrder._id,
        });
      }
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to verify payment: ' + error.message,
      redirectUrl: '/orders',
    });
  }
};

// Handle Razorpay payment failure
exports.handlePaymentFailure = async (req, res) => {
  try {
    const { addressId, paymentMethod, couponCode, razorpayOrderId } = req.body;
   const userId = req.session.user.id;

    // Validate address
    const address = await Address.findOne({ _id: addressId, userId });
    if (!address) {
      return res.status(400).json({
        success: false,
        message: 'Invalid address selected',
      });
    }

    // Fetch cart
    const cart = await Cart.findOne({ user: userId }).populate('cartItem.productId');
    if (!cart || !cart.cartItem.length) {
      console.log('Cart is empty or not found');
      return res.status(400).json({
        success: false,
        message: 'Cart is empty',
      });
    }

    // Create order with failed payment status
    const order = await createOrder(userId, addressId, paymentMethod, couponCode, {
      paymentId: null,
      razorpayOrderId: razorpayOrderId || null,
      paymentStatus: 'Failed',
    });

    // Clear cart
    await Cart.findOneAndUpdate(
      { user: userId },
      { $set: { cartItem: [], cartTotal: 0 } }
    );

    res.json({
      success: false,
      message: 'Payment failed',
      redirectUrl: '/orders',
      orderId: order._id,
    });
  } catch (error) {
    console.error('Error handling payment failure:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process payment failure',
      redirectUrl: '/orders',
    });
  }
};

// Retry payment
exports.retryPayment = async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.session.user.id;

    if (!process.env.RAZORPAY_KEY_ID) {
      console.error('RAZORPAY_KEY_ID is not set in environment variables');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error: Missing Razorpay Key ID',
      });
    }

    const order = await Orders.findById(orderId);
    if (!order || order.userId.toString() !== userId.toString()) {
      console.log('Invalid order or unauthorized:', order ? order.userId : 'Order not found');
      return res.status(400).json({
        success: false,
        message: 'Invalid order or unauthorized',
      });
    }

    if (order.paymentStatus !== 'Failed') {
      console.log('Order is not in Failed status:', order.paymentStatus);
      return res.status(400).json({
        success: false,
        message: 'Order is not eligible for retry payment',
      });
    }

    // Create new Razorpay order
    const options = {
      amount: Math.round(order.finalAmount * 100),
      currency: 'INR',
      receipt: `retry_${order.orderNumber}`,
    };

    const razorpayOrder = await razorpayInstance.orders.create(options);
    console.log('Razorpay order created:', razorpayOrder.id, 'Key ID:', process.env.RAZORPAY_KEY_ID);

    res.json({
      success: true,
      order_id: razorpayOrder.id,
      amount: options.amount,
      currency: options.currency,
      key_id: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error('Error retrying payment:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retry payment',
    });
  }
};