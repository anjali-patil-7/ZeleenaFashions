const Orders = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const Wallet = require('../../models/walletSchema');
const Product= require('../../models/productSchema')
const mongoose = require('mongoose');

// List all orders with search, sort, and pagination
exports.getOrders = async (req, res) => {
    try {
        const { query, page = 1, limit = 10, sort = 'desc' } = req.query;
        const currentPage = parseInt(page);
        const perPage = parseInt(limit);

        let filter = {};
        if (query) {
            filter = {
                $or: [
                    { orderNumber: { $regex: query, $options: 'i' } },
                    { userName: { $regex: query, $options: 'i' } },
                    { status: { $regex: query, $options: 'i' } },
                    { paymentStatus: { $regex: query, $options: 'i' } }
                ]
            };
        }

        const sortOrder = sort === 'asc' ? 1 : -1;

        const totalOrders = await Orders.countDocuments(filter);
        const orders = await Orders.find(filter)
            .populate('userId', 'name email')
            .sort({ orderDate: sortOrder })
            .skip((currentPage - 1) * perPage)
            .limit(perPage)
            .lean();

        const totalPages = Math.ceil(totalOrders / perPage);

        res.render('admin/orders', {
            orders: orders.map(order => ({
                ...order,
                userName: order.userId?.name || 'Unknown',
                hasReturnRequest: order.orderedItem.some(item => item.productStatus === 'Return Requested'),
                hasReturnApproved: order.orderedItem.some(item => item.productStatus === 'Return Approved'),
                hasReturnRejected: order.orderedItem.some(item => item.productStatus === 'Return Rejected')
            })),
            currentPage,
            totalPages,
            limit: perPage,
            searchQuery: query,
            sort
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Error fetching orders');
        res.redirect('/admin/orders');
    }
};

// View detailed order
exports.getOrderDetails = async (req, res) => {
    try {
        const order = await Orders.findById(req.params.id)
            .populate('userId', 'name email phone')
            .populate('deliveryAddress')
            .populate('orderedItem.productId')
            .populate('couponApplied')
            .lean();

        console.log("order details >>>>>", order);

        if (!order) {
            req.flash('error', 'Order not found');
            return res.redirect('/admin/orders');
        }

        // Calculate original subtotal (sum of totalProductPrice)
        const originalSubtotal = order.orderedItem.reduce((sum, item) => sum + (item.totalProductPrice || item.productPrice * item.quantity), 0);

        // Apply 20% discount if orderAmount > 5000
        let totalDiscount = order.discountAmount || 0;
        let finalPrice = order.finalAmount || originalSubtotal;
        if (order.orderAmount > 5000) {
            totalDiscount = order.orderAmount * 0.2; // 20% discount
            finalPrice = order.orderAmount - totalDiscount;
        }

        // Distribute discount proportionally across items
        const processedItems = order.orderedItem.map(item => {
            const itemTotal = item.totalProductPrice || item.productPrice * item.quantity;
            // Proportion of this item's total to the original subtotal
            const discountProportion = originalSubtotal ? itemTotal / originalSubtotal : 0;
            const itemDiscount = totalDiscount * discountProportion;
            const finalTotalProductPrice = itemTotal - itemDiscount;

            return {
                ...item,
                itemDiscount: itemDiscount || 0,
                finalTotalProductPrice: finalTotalProductPrice || itemTotal,
                totalProductPrice: itemTotal
            };
        });

        const shippingCharge = 0;

        res.render('admin/orderdetails', {
            order: {
                ...order,
                userName: order.userId?.name || 'Unknown',
                orderedItem: processedItems
            },
            address: order.deliveryAddress,
            originalSubtotal,
            totalDiscount,
            finalPrice,
            shippingCharge,
            appliedCoupon: order.couponApplied
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Error fetching order details');
        res.redirect('/admin/orders');
    }
};

exports.getOrders = async (req, res) => {
    try {
        const { query, page = 1, limit = 10, sort = 'desc' } = req.query;
        const currentPage = parseInt(page);
        const perPage = parseInt(limit);

        let filter = {};
        if (query) {
            filter = {
                $or: [
                    { orderNumber: { $regex: query, $options: 'i' } },
                    { userName: { $regex: query, $options: 'i' } },
                    { orderStatus: { $regex: query, $options: 'i' } },
                    { paymentStatus: { $regex: query, $options: 'i' } }
                ]
            };
        }

        const sortOrder = sort === 'asc' ? 1 : -1;

        const totalOrders = await Orders.countDocuments(filter);
        const orders = await Orders.find(filter)
            .populate('userId', 'name email')
            .sort({ createdAt: sortOrder })
            .skip((currentPage - 1) * perPage)
            .limit(perPage)
            .lean();

        const totalPages = Math.ceil(totalOrders / perPage);

        res.render('admin/orders', {
            orders: orders.map(order => ({
                ...order,
                userName: order.userId?.name || 'Unknown',
                createdAt: order.createdAt ? new Date(order.createdAt) : null,
                orderStatus: order.orderStatus || 'Unknown',
                hasReturnRequest: order.orderedItem?.some(item => item.productStatus === 'Return Requested') || false,
                hasReturnApproved: order.orderedItem?.some(item => item.productStatus === 'Return Approved') || false,
                hasReturnRejected: order.orderedItem?.some(item => item.productStatus === 'Return Rejected') || false
            })),
            currentPage,
            totalPages,
            limit: perPage,
            searchQuery: query,
            sort
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Error fetching orders');
        res.redirect('/admin/orders');
    }
};

// Update order status
exports.updateOrderStatus = async (req, res) => {
    try {
        const { orderId, orderStatus, paymentStatus } = req.body;

        console.log('Update Order Status Request:', { orderId, orderStatus, paymentStatus });

        const validStatuses = ['Pending', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled'];
        if (!validStatuses.includes(orderStatus)) {
            return res.status(400).json({ success: false, message: 'Invalid order status' });
        }

        const validPaymentStatuses = ['pending', 'Paid', 'failed', 'refunded', 'partially-refunded'];
        if (paymentStatus && !validPaymentStatuses.includes(paymentStatus)) {
            return res.status(400).json({ success: false, message: 'Invalid payment status' });
        }

        const order = await Orders.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Status transition rules
        const currentStatus = order.orderStatus;
        if (currentStatus === 'Delivered' && orderStatus !== 'Returned') {
            return res.status(400).json({ success: false, message: 'Delivered orders can only be changed to Returned' });
        }
        if (['Cancelled', 'Returned'].includes(currentStatus)) {
            return res.status(400).json({ success: false, message: `Cannot change status from ${currentStatus}` });
        }

        // Update order status
        order.orderStatus = orderStatus;

        // Set shipping/delivery dates
        if (orderStatus === 'Shipped') {
            order.shippingDate = new Date();
        } else if (orderStatus === 'Delivered') {
            order.deliveryDate = new Date();
        }

        // Update payment status if provided and not an online payment
        const isOnlinePayment = ['Online', 'Wallet', 'Card', 'UPI'].includes(order.paymentMethod);
        if (paymentStatus && !isOnlinePayment) {
            order.paymentStatus = paymentStatus;
        } else if (paymentStatus && isOnlinePayment) {
            return res.status(400).json({ success: false, message: 'Cannot change payment status for online payments' });
        }

        await order.save();

        res.json({ success: true, message: 'Order status updated successfully' });
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ success: false, message: 'Error updating order status' });
    }
};

// Update order status (new endpoint for form submission)
exports.updateStatus = async (req, res) => {
    try {
        const { orderId, orderStatus, paymentStatus } = req.body;

        const validOrderStatuses = ['Pending', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled'];
        const validPaymentStatuses = ['pending', 'Paid', 'failed', 'refunded', 'partially-refunded'];

        if (!validOrderStatuses.includes(orderStatus) || !validPaymentStatuses.includes(paymentStatus)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const order = await Orders.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        order.orderStatus = orderStatus;
        order.paymentStatus = paymentStatus;

        if (orderStatus === 'Shipped') {
            order.shippingDate = new Date();
        } else if (orderStatus === 'Delivered') {
            order.deliveryDate = new Date();
        }

        await order.save();

        res.json({ success: true, message: 'Order status updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error updating order status' });
    }
};

// Update product status
exports.updateProductStatus = async (req, res) => {
    try {
        const { orderId, productId, productStatus } = req.body;

        console.log('Update Product Status Request:', { orderId, productId, productStatus });

        const validStatuses = ['Pending', 'Shipped', 'Delivered', 'Cancelled', 'Returned'];
        if (!validStatuses.includes(productStatus)) {
            return res.status(400).json({ success: false, message: 'Invalid product status' });
        }

        const order = await Orders.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const item = order.orderedItem.find(item => item._id.toString() === productId);
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found in order' });
        }

        // Status transition rules
        const currentStatus = item.productStatus;
        if (currentStatus === 'Delivered' && productStatus !== 'Returned') {
            return res.status(400).json({ success: false, message: 'Delivered items can only be changed to Returned' });
        }
        if (['Cancelled', 'Returned'].includes(currentStatus)) {
            return res.status(400).json({ success: false, message: `Cannot change status from ${currentStatus}` });
        }

        item.productStatus = productStatus;
        await order.save();

        res.json({ success: true, message: 'Product status updated successfully' });
    } catch (error) {
        console.error('Error updating product status:', error);
        res.status(500).json({ success: false, message: 'Error updating product status' });
    }
};

exports.updatePaymentStatus = async (req, res) => {
    try {
        const { orderId, paymentStatus } = req.body;

        console.log('Update Payment Status Request:', { orderId, paymentStatus });

        const validPaymentStatuses = ['pending', 'Paid', 'failed', 'refunded', 'partially-refunded'];
        if (!validPaymentStatuses.includes(paymentStatus)) {
            return res.status(400).json({ success: false, message: 'Invalid payment status' });
        }

        const order = await Orders.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Payment status transition rules
        const currentPaymentStatus = order.paymentStatus;
        const isOnlinePayment = ['Online', 'Wallet', 'Card', 'UPI'].includes(order.paymentMethod);

        if (isOnlinePayment && !['Paid', 'refunded', 'partially-refunded'].includes(paymentStatus)) {
            return res.status(400).json({ success: false, message: 'Online payments can only be set to Paid, refunded, or partially-refunded' });
        }
        if (currentPaymentStatus === 'Paid' && ['pending', 'failed'].includes(paymentStatus)) {
            return res.status(400).json({ success: false, message: 'Cannot change Paid status to pending or failed' });
        }
        if (currentPaymentStatus === 'failed' && paymentStatus !== 'failed') {
            return res.status(400).json({ success: false, message: 'Cannot change status from failed' });
        }
        if (['refunded', 'partially-refunded'].includes(currentPaymentStatus) && !['refunded', 'partially-refunded'].includes(paymentStatus)) {
            return res.status(400).json({ success: false, message: 'Cannot change status from refunded or partially-refunded' });
        }

        order.paymentStatus = paymentStatus;
        await order.save();

        res.json({ success: true, message: 'Payment status updated successfully' });
    } catch (error) {
        console.error('Error updating payment status:', error);
        res.status(500).json({ success: false, message: 'Error updating payment status' });
    }
};

// Verify return request (approve or reject)
exports.verifyReturn = async (req, res) => {
    try {
      const { orderId, productId, status } = req.body;
  
      // Validate inputs
      if (!mongoose.isValidObjectId(orderId) || !mongoose.isValidObjectId(productId)) {
        return res.status(400).json({ success: false, message: 'Invalid order or product ID' });
      }
  
      if (!['Return Approved', 'Return Rejected'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid return status' });
      }
  
      // Find the order
      const order = await Orders.findById(orderId).populate('orderedItem.productId');
      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }
  
      // Find the specific item in the orderedItem array
      const item = order.orderedItem.id(productId);
      if (!item || item.productStatus !== 'Return Requested') {
        return res.status(400).json({ success: false, message: 'Invalid item or no return requested' });
      }
  
      // Update item status
      item.productStatus = status;
      item.returnApproved = status === 'Return Approved';
      item.returnApprovedDate = status === 'Return Approved' ? new Date() : null;
  
      if (status === 'Return Approved') {
        // Update product stock
        const product = await Product.findById(item.productId);
        if (!product) {
          return res.status(404).json({ success: false, message: 'Product not found' });
        }
        product.stock += item.quantity;
        await product.save();
  
        // Refund to wallet
        let wallet = await Wallet.findOne({ userId: order.userId });
        if (!wallet) {
          // Create a new wallet if it doesn't exist
          wallet = new Wallet({
            userId: order.userId,
            balance: 0,
            transaction: []
          });
        }
  
        // Calculate refund amount (finalTotalProductPrice is after discount)
        const refundAmount = item.finalTotalProductPrice;
  
        // Update wallet balance and add transaction
        wallet.balance += refundAmount;
        wallet.transaction.push({
          amount: refundAmount,
          transactionsMethod: 'Refund',
          date: new Date(),
          orderId: order._id,
          description: `Refund for return of ${item.productId.productName || 'product'} (Order: ${order.orderNumber})`
        });
  
        await wallet.save();
  
        // Mark item as refunded
        item.refunded = true;
  
        // Update order status if all items are returned
        const allItemsReturned = order.orderedItem.every(i => i.productStatus === 'Returned' || i.productStatus === 'Return Approved');
        if (allItemsReturned) {
          order.orderStatus = 'Returned';
        }
  
        // Update payment status if necessary
        const allItemsRefunded = order.orderedItem.every(i => i.refunded || i.productStatus === 'Cancelled');
        if (allItemsRefunded) {
          order.paymentStatus = 'refunded';
        } else {
          const anyItemRefunded = order.orderedItem.some(i => i.refunded);
          if (anyItemRefunded) {
            order.paymentStatus = 'partially-refunded';
          }
        }
      }
  
      await order.save();
  
      res.status(200).json({
        success: true,
        message: `Return request ${status === 'Return Approved' ? 'approved' : 'rejected'} successfully`
      });
    } catch (error) {
      console.error('Error verifying return:', error);
      res.status(500).json({ success: false, message: 'Server error while processing return request' });
    }
  };