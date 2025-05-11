const Orders = require('../../models/orderSchema');
const Cart = require('../../models/cartSchema');
const Coupon = require('../../models/couponSchema');
const Wallet = require('../../models/walletSchema');
const Razorpay = require('razorpay');
const crypto = require('crypto');

// Initialize Razorpay instance
const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Place order (for COD and Wallet)
exports.placeOrder = async (req, res) => {
  try {
    const { addressId, paymentMethod, couponCode } = req.body;
    const userId = req.user.id;

    let paymentStatus = 'Pending';
    if (paymentMethod === 'wallet') {
      const wallet = await Wallet.findOne({ userId });
      const finalAmount = await calculateFinalAmount(userId, couponCode);

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

    // Fetch cart
    const cart = await Cart.findOne({ user: userId }).populate('cartItem.productId');

    if (!cart || !cart.cartItem.length) {
      console.log('Cart is empty or not found');
      return res.status(400).json({
        success: false,
        message: 'Cart is empty',
      });
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
      message: 'Failed to place order',
    });
  }
};

// Create Razorpay order
exports.createRazorpayOrder = async (req, res) => {
  try {
    const { addressId, paymentMethod, couponCode } = req.body;
    console.log('Creating Razorpay order for user:', req.user.id);

    // Fetch cart details
    const cart = await Cart.findOne({ user: req.user.id }).populate('cartItem.productId');
    console.log('Cart:', JSON.stringify(cart, null, 2));

    if (!cart || !cart.cartItem.length) {
      console.log('Cart is empty or not found');
      return res.status(400).json({
        success: false,
        message: 'Cart is empty',
      });
    }

    // Calculate totals
    let subtotal = 0;
    let discountAmount = 0;
    let couponDiscount = 0;

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

    // Apply coupon if provided
    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode, isActive: true });
      if (coupon) {
        if (coupon.minPurchase && subtotal < coupon.minPurchase) {
          return res.status(400).json({
            success: false,
            message: `Minimum purchase of ₹${coupon.minPurchase} required for this coupon`,
          });
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
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired coupon',
        });
      }
    }

    const finalAmount = subtotal - discountAmount - couponDiscount;

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
      message: 'Failed to create payment order',
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

    console.log('Verifying payment:', { orderId, razorpayOrderId, razorpayPaymentId });

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
      cart = await Cart.findOne({ user: req.user.id }).populate('cartItem.productId');
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
        const newOrder = await createOrder(req.user.id, addressId, paymentMethod, couponCode, {
          paymentId: razorpayPaymentId,
          razorpayOrderId,
          paymentStatus: 'Failed',
        });

        // Clear cart
        await Cart.findOneAndUpdate(
          { user: req.user.id },
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
      const newOrder = await createOrder(req.user.id, addressId, paymentMethod, couponCode, {
        paymentId: razorpayPaymentId,
        razorpayOrderId,
        paymentStatus: 'Paid',
      });

      // Clear cart
      await Cart.findOneAndUpdate(
        { user: req.user.id },
        { $set: { cartItem: [], cartTotal: 0 } }
      );

      console.log('Initial payment successful for order:', newOrder._id);
      return res.json({
        success: true,
        redirectUrl: `/orderconfirmation/${newOrder._id}`,
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
      const cart = await Cart.findOne({ user: req.user.id }).populate('cartItem.productId');
      if (cart && cart.cartItem.length) {
        const newOrder = await createOrder(req.user.id, addressId, paymentMethod, couponCode, {
          paymentId: razorpayPaymentId || null,
          razorpayOrderId: razorpayOrderId || null,
          paymentStatus: 'Failed',
        });

        // Clear cart
        await Cart.findOneAndUpdate(
          { user: req.user.id },
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
    const userId = req.user.id;

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
      message: 'Failed to process payment failure',
      redirectUrl: '/orders',
    });
  }
};

// Retry payment
exports.retryPayment = async (req, res) => {
  try {
    const { orderId } = req.body;
    console.log('Retrying payment for order:', orderId);

    if (!process.env.RAZORPAY_KEY_ID) {
      console.error('RAZORPAY_KEY_ID is not set in environment variables');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error: Missing Razorpay Key ID',
      });
    }

    const order = await Orders.findById(orderId);

    if (!order || order.paymentStatus !== 'Failed') {
      console.log('Invalid order or payment status:', order ? order.paymentStatus : 'Order not found');
      return res.status(400).json({
        success: false,
        message: 'Invalid order or payment status',
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
      message: 'Failed to retry payment',
    });
  }
};


// Helper function to calculate final amount
async function calculateFinalAmount(userId, couponCode) {
  const cart = await Cart.findOne({ user: userId }).populate('cartItem.productId');
  let subtotal = 0;
  let discountAmount = 0;
  let couponDiscount = 0;

  cart.cartItem.forEach(item => {
    if (!item.productId) return;
    let itemPrice = item.productId.price;
    if (item.productId.offer && item.productId.offer.discount) {
      discountAmount += (itemPrice * item.quantity * item.productId.offer.discount) / 100;
      itemPrice = itemPrice * (1 - item.productId.offer.discount / 100);
    }
    subtotal += itemPrice * item.quantity;
  });

  if (couponCode) {
    const coupon = await Coupon.findOne({ code: couponCode, isActive: true });
    if (coupon) {
      if (coupon.discountType === 'percentage') {
        couponDiscount = (subtotal * coupon.discount) / 100;
        if (coupon.maxDiscount && couponDiscount > coupon.maxDiscount) {
          couponDiscount = coupon.maxDiscount;
        }
      } else {
        couponDiscount = coupon.discount;
      }
    }
  }

  return subtotal - discountAmount - couponDiscount;
}

// Helper function to create order
async function createOrder(userId, addressId, paymentMethod, couponCode, paymentDetails) {
  const cart = await Cart.findOne({ user: userId }).populate('cartItem.productId');

  // Calculate totals
  let subtotal = 0;
  let discountAmount = 0;
  let couponDiscount = 0;

  const orderedItems = cart.cartItem
    .filter(item => item.productId) // Skip invalid products
    .map(item => {
      let productPrice = item.productId.price;
      let finalProductPrice = productPrice;

      // Apply offer if available
      let productDiscount = 0;
      if (item.productId.offer && item.productId.offer.discount) {
        productDiscount = (productPrice * item.productId.offer.discount) / 100;
        finalProductPrice = productPrice * (1 - item.productId.offer.discount / 100);
        discountAmount += productDiscount * item.quantity;
      }

      subtotal += productPrice * item.quantity;

      return {
        productId: item.productId._id,
        quantity: item.quantity,
        productPrice,
        finalProductPrice,
        totalProductPrice: productPrice * item.quantity,
        finalTotalProductPrice: finalProductPrice * item.quantity,
        productStatus: 'Pending',
      };
    });

  // Apply coupon
  let couponId = null;
  if (couponCode) {
    const coupon = await Coupon.findOne({ code: couponCode, isActive: true });
    if (coupon) {
      couponId = coupon._id;
      if (coupon.discountType === 'percentage') {
        couponDiscount = (subtotal * coupon.discount) / 100;
        if (coupon.maxDiscount && couponDiscount > coupon.maxDiscount) {
          couponDiscount = coupon.maxDiscount;
        }
      } else {
        couponDiscount = coupon.discount;
      }
    }
  }

  const finalAmount = subtotal - discountAmount - couponDiscount;

  // Generate unique order number
  const orderNumber = `ORD_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  // Create order
  const order = new Orders({
    userId,
    cartId: cart._id,
    deliveryAddress: addressId,
    orderNumber,
    orderedItem: orderedItems,
    orderAmount: subtotal,
    discountAmount,
    couponDiscount,
    couponCode,
    couponApplied: couponId,
    finalAmount,
    paymentMethod,
    paymentStatus: paymentDetails.paymentStatus || 'Pending',
    paymentId: paymentDetails.paymentId || null,
    razorpayOrderId: paymentDetails.razorpayOrderId || null,
    orderStatus: 'Pending',
  });

  await order.save();
  return order;
}