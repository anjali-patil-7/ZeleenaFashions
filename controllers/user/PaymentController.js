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
      message: 'Failed to create payment order: ' + error.message,
    });
  }
};

// Verify Razorpay payment
exports.verifyPayment = async (req, res) => {
  try {
    const {
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      orderId,
    } = req.body;

    console.log('Received request to verify payment:', {
      orderId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });

    // Validate input
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !orderId) {
      console.log('Missing required fields in request');
      return res.status(400).json({
        success: false,
        message: 'Missing required payment fields',
        redirectUrl: '/orders',
      });
    }

    // Fetch the order
    const order = await Orders.findById(orderId);
    if (!order) {
      console.log('Order not found:', orderId);
      return res.status(400).json({
        success: false,
        message: 'Order not found',
        redirectUrl: '/orders',
      });
    }

    console.log('Order from DB:', {
      orderId: order._id,
      razorpayOrderId: order.razorpayOrderId,
      paymentStatus: order.paymentStatus,
    });

    // Validate Razorpay credentials
    if (!process.env.RAZORPAY_KEY_SECRET) {
      console.error('RAZORPAY_KEY_SECRET is not set');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error: Missing Razorpay secret',
        redirectUrl: '/orders',
      });
    }

    // Verify Razorpay signature
    const body = razorpayOrderId + '|' + razorpayPaymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    console.log('Signature verification:', {
      body,
      expectedSignature,
      receivedSignature: razorpaySignature,
      isSignatureValid: expectedSignature === razorpaySignature,
      isOrderIdValid: order.razorpayOrderId === razorpayOrderId,
    });

    // Check both signature and order ID
    if (expectedSignature !== razorpaySignature) {
      console.log('Invalid signature detected');
      order.paymentStatus = 'Failed';
      order.paymentId = razorpayPaymentId || null;
      await order.save();

      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature',
        redirectUrl: '/orders',
        orderId: order._id,
      });
    }

    if (order.razorpayOrderId !== razorpayOrderId) {
      console.log('Razorpay order ID mismatch', {
        dbRazorpayOrderId: order.razorpayOrderId,
        receivedRazorpayOrderId: razorpayOrderId,
      });
      order.paymentStatus = 'Failed';
      order.paymentId = razorpayPaymentId || null;
      await order.save();

      return res.status(400).json({
        success: false,
        message: 'Razorpay order ID mismatch',
        redirectUrl: '/orders',
        orderId: order._id,
      });
    }

    // Update order with successful payment
    order.paymentStatus = 'Paid';
    order.paymentId = razorpayPaymentId;
    order.orderStatus = 'Pending'; // Reset to Pending for processing
    await order.save();
    console.log('Order updated:', order._id, 'Payment status:', order.paymentStatus);

    // Clear cart
    await Cart.findOneAndUpdate(
      { user: req.user.id },
      { $set: { cartItem: [], cartTotal: 0 } }
    );

    res.json({
      success: true,
      redirectUrl: `user/confirmorder/${order._id}`,
      orderId: order._id,
    });
  } catch (error) {
    console.error('Error verifying payment:', error);

    // Handle error case by marking payment as failed
    const order = await Orders.findById(req.body.orderId);
    if (order) {
      order.paymentStatus = 'Failed';
      order.paymentId = req.body.razorpayPaymentId || null;
      order.razorpayOrderId = req.body.razorpayOrderId || null;
      await order.save();
      console.log('Order updated to failed:', order._id);
    }

    res.status(500).json({
      success: false,
      message: 'Failed to verify payment: ' + error.message,
      redirectUrl: '/orders',
      orderId: order?._id,
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
      message: 'Failed to process payment failure: ' + error.message,
      redirectUrl: '/orders',
    });
  }
};

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
      message: 'Failed to place order: ' + error.message,
    });
  }
};

// Retry payment
exports.retryPayment = async (req, res) => {
  try {
    const { orderId } = req.body;
    console.log('Retrying payment for order:', orderId);

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      console.error('Razorpay credentials are missing');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error: Missing Razorpay credentials',
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
      receipt: `retry_${order.orderNumber}_${Date.now()}`,
    };

    const razorpayOrder = await razorpayInstance.orders.create(options);
    console.log('Razorpay order created:', razorpayOrder.id);

    // Update the original order with the new Razorpay order ID
    order.razorpayOrderId = razorpayOrder.id;
    order.paymentStatus = 'Pending'; // Reset to Pending for retry
    await order.save();
    console.log('Order updated with new Razorpay order ID:', {
      orderId: order._id,
      razorpayOrderId: razorpayOrder.id,
    });

    res.json({
      success: true,
      key: process.env.RAZORPAY_KEY_ID,
      orderId: razorpayOrder.id,
      amount: options.amount,
      currency: options.currency,
      originalOrderId: orderId,
    });
  } catch (error) {
    console.error('Error retrying payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retry payment: ' + error.message,
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
    .filter(item => item.productId)
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
  console.log('Order created:', order._id);
  return order;
}