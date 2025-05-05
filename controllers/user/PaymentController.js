const order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const payment = require('../../models/paymentSchema');


// Function to generate a unique order number
const generateOrderNumber = () => {
    const timestamp = Date.now();
    const random = Math.floor(1000 + Math.random() * 9000); // 4-digit random number
    return `ORD-${timestamp}-${random}`;
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
      res.redirect(`/orderconfirmation/${order._id}`);
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
      res.render('user/orderconfirmation', { order });
    } catch (error) {
      console.error('Error rendering order confirmation:', error);
      req.flash('error_msg', 'An error occurred.');
      res.redirect('/cart');
    }
  };
