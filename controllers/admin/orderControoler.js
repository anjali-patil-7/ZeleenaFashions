const Orders = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const Wallet = require('../../models/walletSchema');
const Product = require('../../models/productSchema');
const mongoose = require('mongoose');

// List all orders with search, sort, and pagination
exports.getOrders = async (req, res) => {
    try {
        const { query, page, limit = 5, sort = 'desc' } = req.query;

        // Validate inputs
        const currentPage = Math.max(1, parseInt(page) || 1);
        const perPage = Math.max(1, Math.min(parseInt(limit) || 10, 50));
        const sortOrder = sort === 'asc' ? 1 : -1;

        // Build search filter
        let filter = {};
        if (query && typeof query === 'string' && query.trim()) {
            const sanitizedQuery = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            filter = {
                $or: [
                    { orderNumber: { $regex: sanitizedQuery, $options: 'i' } },
                    { orderStatus: { $regex: sanitizedQuery, $options: 'i' } },
                    { paymentStatus: { $regex: sanitizedQuery, $options: 'i' } },
                    { 'user.name': { $regex: sanitizedQuery, $options: 'i' } } // Include user.name in the same $or
                ]
            };
        }

        console.log('Search Filter:', JSON.stringify(filter));
        console.log('Query Params:', { query, currentPage, perPage, sort });

        // Use aggregation to join with User for name search
        let aggregationPipeline = [
            {
                $lookup: {
                    from: 'users',
                    localField: 'userId',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            {
                $unwind: { path: '$user', preserveNullAndEmptyArrays: true }
            }
        ];

        // Add search filter to aggregation
        if (Object.keys(filter).length > 0) {
            aggregationPipeline.push({ $match: filter });
        }

        // Create a copy of the pipeline for counting
        let countPipeline = [...aggregationPipeline, { $count: 'total' }];
        const countResult = await Orders.aggregate(countPipeline);
        const totalOrders = countResult.length > 0 ? countResult[0].total : 0;
        const totalPages = Math.ceil(totalOrders / perPage) || 1;

        // Add sorting, skipping, and limiting to the main pipeline
        aggregationPipeline.push(
            { $sort: { createdAt: sortOrder } },
            { $skip: (currentPage - 1) * perPage },
            { $limit: perPage }
        );

        // Fetch orders
        const orders = await Orders.aggregate(aggregationPipeline);
        
        // Process orders
        const processedOrders = orders.map(order => ({
            ...order,
            _id: order._id.toString(),
            userName: order.user?.name || 'Unknown',
            createdAt: order.createdAt ? new Date(order.createdAt) : null,
            orderStatus: order.orderStatus || 'Unknown',
            paymentStatus: order.paymentStatus || 'Unknown',
            hasReturnRequest: order.orderedItem?.some(item => item.productStatus === 'Return Requested') || false,
            hasReturnApproved: order.orderedItem?.some(item => item.productStatus === 'Return Approved') || false,
            hasReturnRejected: order.orderedItem?.some(item => item.productStatus === 'Return Rejected') || false
        }));

        res.render('admin/orders', {
            orders: processedOrders,
            currentPage: Math.min(currentPage, totalPages),
            totalPages,
            limit: perPage,
            searchQuery: query || '',
            sort
        });
    } catch (error) {
        console.error('Error in getOrders:', error);
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

        const originalSubtotal = order.orderedItem.reduce((sum, item) => sum + (item.totalProductPrice || item.productPrice * item.quantity), 0);

        let totalDiscount = order.discountAmount || 0;
        let finalPrice = order.finalAmount || originalSubtotal;
        if (order.orderAmount > 5000) {
            totalDiscount = order.orderAmount * 0.2;
            finalPrice = order.orderAmount - totalDiscount;
        }

        const processedItems = order.orderedItem.map(item => {
            const itemTotal = item.totalProductPrice || item.productPrice * item.quantity;
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

        const shippingCharge = 100;

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

// Update order status
exports.updateOrderStatus = async (req, res) => {
    try {
        const { orderId, orderStatus, paymentStatus } = req.body;

        console.log('Update Order Status Request:', { orderId, orderStatus, paymentStatus });

        const validStatuses = ['Pending', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled'];
        if (!validStatuses.includes(orderStatus)) {
            return res.status(400).json({ success: false, message: 'Invalid order status' });
        }

        const validPaymentStatuses = ['pending', 'Paid', 'failed', 'refunded', 'Partially Refunded'];
        if (paymentStatus && !validPaymentStatuses.includes(paymentStatus)) {
            return res.status(400).json({ success: false, message: 'Invalid payment status' });
        }

        const order = await Orders.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const currentStatus = order.orderStatus;
        if (currentStatus === 'Delivered' && orderStatus !== 'Returned') {
            return res.status(400).json({ success: false, message: 'Delivered orders can only be changed to Returned' });
        }
        if (['Cancelled', 'Returned'].includes(currentStatus)) {
            return res.status(400).json({ success: false, message: `Cannot change status from ${currentStatus}` });
        }

        order.orderStatus = orderStatus;

        if (orderStatus === 'Shipped') {
            order.shippingDate = new Date();
        } else if (orderStatus === 'Delivered') {
            order.deliveryDate = new Date();
        }

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

        const validPaymentStatuses = ['pending', 'Paid', 'failed', 'refunded', 'Partially Refunded'];
        if (!validPaymentStatuses.includes(paymentStatus)) {
            return res.status(400).json({ success: false, message: 'Invalid payment status' });
        }

        const order = await Orders.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const currentPaymentStatus = order.paymentStatus;
        const isOnlinePayment = ['Online', 'Wallet', 'Card', 'UPI'].includes(order.paymentMethod);

        if (isOnlinePayment && !['Paid', 'refunded', 'Partially Refunded'].includes(paymentStatus)) {
            return res.status(400).json({ success: false, message: 'Online payments can only be set to Paid, refunded, or partially-refunded' });
        }
        if (currentPaymentStatus === 'Paid' && ['pending', 'failed'].includes(paymentStatus)) {
            return res.status(400).json({ success: false, message: 'Cannot change Paid status to pending or failed' });
        }
        if (currentPaymentStatus === 'failed' && paymentStatus !== 'failed') {
            return res.status(400).json({ success: false, message: 'Cannot change status from failed' });
        }
        if (['refunded', 'Partially Refunded'].includes(currentPaymentStatus) && !['refunded', 'partially-refunded'].includes(paymentStatus)) {
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

// Verify return request
exports.verifyReturn = async (req, res) => {
    try {
      const { orderId, productId, status } = req.body;
  
      if (!mongoose.isValidObjectId(orderId) || !mongoose.isValidObjectId(productId)) {
        return res.status(400).json({ success: false, message: 'Invalid order or product ID' });
      }
  
      if (!['Return Approved', 'Return Rejected'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid return status' });
      }
  
      const order = await Orders.findById(orderId).populate('orderedItem.productId');
      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }
  
      const item = order.orderedItem.id(productId);
      if (!item || item.productStatus !== 'Return Requested') {
        return res.status(400).json({ success: false, message: 'Invalid item or no return requested' });
      }
  
      item.productStatus = status;
      item.returnApproved = status === 'Return Approved';
      item.returnApprovedDate = status === 'Return Approved' ? new Date() : null;
  
      if (status === 'Return Approved') {
        const product = await Product.findById(item.productId);
        if (!product) {
          return res.status(404).json({ success: false, message: 'Product not found' });
        }
        product.stock += item.quantity;
        await product.save();
  
        let wallet = await Wallet.findOne({ userId: order.userId });
        if (!wallet) {
          wallet = new Wallet({
            userId: order.userId,
            balance: 0,
            transaction: []
          });
        }
  
        const refundAmount = item.finalTotalProductPrice;
  
        wallet.balance += refundAmount;
        wallet.transaction.push({
          amount: refundAmount,
          transactionsMethod: 'Refund',
          date: new Date(),
          orderId: order._id,
          description: `Refund for return of ${item.productId.productName || 'product'} (Order: ${order.orderNumber})`
        });
  
        await wallet.save();
  
        item.refunded = true;
  
        const allItemsReturned = order.orderedItem.every(i => i.productStatus === 'Returned' || i.productStatus === 'Return Approved');
        if (allItemsReturned) {
          order.orderStatus = 'Returned';
        }
  
        const allItemsRefunded = order.orderedItem.every(i => i.refunded || i.productStatus === 'Cancelled');
        if (allItemsRefunded) {
          order.paymentStatus = 'refunded';
        } else {
          const anyItemRefunded = order.orderedItem.some(i => i.refunded);
          if (anyItemRefunded) {
            order.paymentStatus = 'Partially Refunded';
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