const Orders = require('../../models/orderSchema');
const Address = require('../../models/addressSchema');
const Product = require('../../models/productSchema');
const Wallet = require('../../models/walletSchema')
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');

// List all orders for a user with optional search
exports.getOrders = async (req, res) => {
    try {
        const userId = req.user.id;
        if (!userId) {
            return res.redirect('/login');
        }

        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';

        let query = { userId };
        if (search) {
            query.orderNumber = { $regex: search, $options: 'i' };
        }

        const orders = await Orders.find(query)
            .populate('orderedItem.productId')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const totalOrders = await Orders.countDocuments(query);

        const pagination = {
            page,
            totalPages: Math.ceil(totalOrders / limit),
            hasPrevPage: page > 1,
            hasNextPage: page < Math.ceil(totalOrders / limit),
            prevPage: page - 1,
            nextPage: page + 1,
            totalOrders
        };

        res.render('user/orders', {
            orders,
            pagination,
            search,
            user: req.user.id
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).render('error', { message: 'Failed to load orders' });
    }
};

// Get order details
exports.getOrderDetails = async (req, res) => {
    try {
        const userId = req.user.id;
        if (!userId) {
            return res.redirect('/login');
        }

        const orderId = req.params.orderId;
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(404).render('error', { message: 'Invalid order ID' });
        }

        const order = await Orders.findOne({ _id: orderId, userId })
            .populate('orderedItem.productId')
            .lean();

        if (!order) {
            return res.status(404).render('error', { message: 'Order not found' });
        }

        const address = await Address.findOne({ _id: order.deliveryAddress }).lean();

        let discountAmount = order.discountAmount || 0;
        let finalPrice = order.finalAmount;

        res.render('user/orderdetails', {
            order,
            address: { address: [address] },
            discountAmount,
            finalPrice,
            user: userId
        });
    } catch (error) {
        console.error('Error fetching order details:', error);
        res.status(500).render('error', { message: 'Failed to load order details' });
    }
};

// Cancel order with reason and update inventory
exports.cancelOrder = async (req, res) => {
    try {
        const userId = req.user.id;
        const orderId = req.params.orderId;
        const { cancelReason } = req.body;

        const order = await Orders.findOne({ _id: orderId, userId })
            .populate('orderedItem.productId');
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (order.orderStatus !== 'Pending' && order.orderStatus !== 'Shipped') {
            return res.status(400).json({ success: false, message: 'Order cannot be cancelled' });
        }

        order.orderStatus = 'Cancelled';
        order.cancelReason = cancelReason || 'No reason provided';
        for (const item of order.orderedItem) {
            if (item.productStatus === 'Pending' || item.productStatus === 'Shipped') {
                item.productStatus = 'Cancelled';

                const product = await Product.findById(item.productId._id);
                if (product) {
                    product.totalStock += item.quantity;
                    await product.save();
                }
            }
        }

        await order.save();
        res.json({ success: true, message: 'Order cancelled successfully' });
    } catch (error) {
        console.error('Error cancelling order:', error);
        res.status(500).json({ success: false, message: 'Failed to cancel order' });
    }
};

// Download invoice
exports.downloadInvoice = async (req, res) => {
    try {
        console.log('Download invoice route hit');
        if (!req.user.id) {
            console.error('User not authenticated');
            return res.status(401).send('Authentication required');
        }
        
        const userId = req.user.id;
        const orderId = req.params.orderId;
        console.log('Downloading invoice for user:', userId, 'order:', orderId);

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            console.log('Invalid order ID format:', orderId);
            return res.status(400).send('Invalid order ID format');
        }

        console.log('Searching for order in database...');
        const order = await Orders.findOne({ _id: orderId, userId })
            .populate('orderedItem.productId')
            .populate('deliveryAddress')
            .lean();

        console.log('Order query result:', order ? 'Found' : 'Not found');

        if (!order) {
            console.log('Order not found for ID:', orderId, 'user:', userId);
            return res.status(404).send('Order not found');
        }

        console.log('Order found, generating PDF...');
        const doc = new PDFDocument({
            size: 'A4',
            margin: 50
        });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.orderNumber || orderId}.pdf`);
        
        doc.pipe(res);
        doc.fontSize(20).text('INVOICE', { align: 'center' });
        doc.moveDown();
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();

        doc.fontSize(12).text('Order Details', { underline: true });
        doc.fontSize(10);
        doc.text(`Order Number: ${order.orderNumber || orderId}`);
        doc.text(`Order Date: ${new Date(order.createdAt).toLocaleDateString()}`);
        doc.text(`Payment Method: ${order.paymentMethod || 'Cash on Delivery'}`);
        doc.text(`Order Status: ${order.orderStatus}`);
        doc.moveDown();

        const address = order.deliveryAddress;
        doc.fontSize(12).text('Shipping Address', { underline: true });
        doc.fontSize(10);
        
        if (address) {
            doc.text(address.name || 'N/A');
            doc.text(address.mobile || 'N/A');
            doc.text([
                address.houseName,
                address.street,
                address.city,
                address.state,
                address.pincode,
                address.country
            ].filter(Boolean).join(', '));
        } else {
            doc.text('Shipping Address: Not available');
        }
        doc.moveDown();

        doc.fontSize(12).text('Ordered Items', { underline: true });
        doc.fontSize(10);
        
        let yPosition = doc.y + 5;
        doc.font('Helvetica-Bold');
        doc.text('Item', 50, yPosition, { width: 200 });
        doc.text('Price', 250, yPosition, { width: 70 });
        doc.text('Qty', 320, yPosition, { width: 70 });
        doc.text('Total', 390, yPosition, { width: 100 });
        doc.font('Helvetica');
        
        yPosition += 20;
        doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();
        yPosition += 10;
        
        if (order.orderedItem && order.orderedItem.length > 0) {
            order.orderedItem.forEach(item => {
                if (!item.productId) {
                    console.log('Missing product data for item:', item);
                    return;
                }
                
                const productName = item.productId.productName || 'Unknown Product';
                const unitPrice = item.unitPrice || (item.totalProductPrice / item.quantity) || 0;
                
                doc.text(productName, 50, yPosition, { width: 200 });
                doc.text(`₹${unitPrice.toFixed(2)}`, 250, yPosition, { width: 70 });
                doc.text(`${item.quantity}`, 320, yPosition, { width: 70 });
                doc.text(`₹${item.totalProductPrice.toFixed(2)}`, 390, yPosition, { width: 100 });
                
                yPosition += 20;
                if (yPosition > 700) {
                    doc.addPage();
                    yPosition = 50;
                }
            });
        } else {
            doc.text('No items found', 50, yPosition);
            yPosition += 20;
        }
        
        doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();
        yPosition += 20;

        doc.fontSize(12).text('Price Summary', 350, yPosition, { underline: true });
        doc.fontSize(10);
        yPosition += 20;
        doc.text('Items Total:', 350, yPosition);
        doc.text(`₹${order.orderAmount.toFixed(2)}`, 480, yPosition);
        yPosition += 15;
        if (order.shippingCharge) {
            doc.text('Shipping Charge:', 350, yPosition);
            doc.text(`₹${order.shippingCharge.toFixed(2)}`, 480, yPosition);
            yPosition += 15;
        }
        if (order.discountAmount) {
            doc.text('Discount:', 350, yPosition);
            doc.text(`₹${order.discountAmount.toFixed(2)}`, 480, yPosition);
            yPosition += 15;
        }
        doc.moveTo(350, yPosition).lineTo(550, yPosition).stroke();
        yPosition += 15;
        doc.font('Helvetica-Bold');
        doc.text('Final Amount:', 350, yPosition);
        doc.text(`₹${order.finalAmount.toFixed(2)}`, 480, yPosition);
        doc.font('Helvetica');
        
        doc.fontSize(8);
        const footerPosition = doc.page.height - 50;
        doc.text('Thank you for your order!', 50, footerPosition, { align: 'center' });
        doc.text(`Generated on ${new Date().toLocaleString()}`, 50, footerPosition + 15, { align: 'center' });

        doc.end();
        console.log('Invoice generated successfully for order:', orderId);
    } catch (error) {
        console.error('Error generating invoice:', error);
        res.status(500).send(`Failed to generate invoice: ${error.message}`);
    }
};

//return request
exports.requestReturn = async (req, res) => {
    try {
      const { orderId } = req.params;
      const { productId, returnReason } = req.body;
  
      // Validate inputs
      if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(productId)) {
        return res.status(400).json({ success: false, message: 'Invalid order or product ID' });
      }
  
      if (!returnReason || returnReason.trim() === '') {
        return res.status(400).json({ success: false, message: 'Return reason is required' });
      }
  
      // Find the order
      const order = await Orders.findById(orderId);
      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }
  
      // Find the specific ordered item
      const orderedItem = order.orderedItem.find(
        item => item._id.toString() === productId
      );
  
      if (!orderedItem) {
        return res.status(404).json({ success: false, message: 'Product not found in order' });
      }
  
      // Check if the item is eligible for return
      if (orderedItem.productStatus !== 'Delivered') {
        return res.status(400).json({ success: false, message: 'Item is not eligible for return' });
      }
  
      if (orderedItem.returnRequestDate) {
        return res.status(400).json({ success: false, message: 'Return already requested for this item' });
      }
  
      // Update the ordered item with return details
      orderedItem.productStatus = 'Return Requested';
      orderedItem.returnReason = returnReason;
      orderedItem.returnRequestDate = new Date();
  
      // Save the updated order
      await order.save();
  
      return res.status(200).json({ success: true, message: 'Return request submitted successfully' });
    } catch (error) {
      console.error('Error in requestReturn:', error);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  };

// Order confirmation
exports.getOrderConfirmation = async (req, res) => {
    try {
        const userId = req.user.id;
        const orderId = req.params.orderId;

        const order = await Orders.findOne({ _id: orderId, userId }).lean();
        if (!order) {
            return res.status(404).render('error', { message: 'Order not found' });
        }

        res.render('user/confirmOrder', {
            order,
            user: req.user.id
        });
    } catch (error) {
        console.error('Error fetching order confirmation:', error);
        res.status(500).render('error', { message: 'Failed to load order confirmation' });
    }
};

// Cancel single product
exports.cancelSingleProduct = async (req, res) => {
    try {
        const { orderId, productId } = req.params;
        const { cancelReason } = req.body;
        const userId = req.user.id;

        // Validate user authentication
        if (!userId) {
            return res.status(401).json({ success: false, message: 'User not authenticated' });
        }

        // Find the order
        const order = await Orders.findById(orderId).populate('orderedItem.productId');
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Check if userId exists in the order
        if (!order.userId) {
            console.error(`Order ${orderId} is missing userId`);
            return res.status(400).json({ success: false, message: 'Invalid order: missing user information' });
        }

        // Check if the order belongs to the user
        if (order.userId.toString() !== userId.toString()) {
            return res.status(403).json({ success: false, message: 'Unauthorized action' });
        }

        // Find the product in orderedItem
        const item = order.orderedItem.find(
            (item) => item._id.toString() === productId
        );
        if (!item) {
            return res.status(404).json({ success: false, message: 'Product not found in order' });
        }

        // Check if the product can be cancelled
        if (!['Pending', 'Shipped'].includes(item.productStatus)) {
            return res.status(400).json({
                success: false,
                message: 'Product cannot be cancelled in current status'
            });
        }

        // Update product status and cancellation reason
        item.productStatus = 'Cancelled';
        item.cancelReason = cancelReason || 'No reason provided';

        // Calculate refund amount for the product (after discount)
        let refundAmount = item.totalProductPrice || 0;
        if (order.discountAmount && order.discountAmount > 0) {
            const totalOrderAmountBeforeDiscount = order.orderAmount || 0;
            if (totalOrderAmountBeforeDiscount > 0) {
                const productProportion = item.totalProductPrice / totalOrderAmountBeforeDiscount;
                const productDiscount = order.discountAmount * productProportion;
                refundAmount = item.totalProductPrice - productDiscount;
            }
        }
        refundAmount = Math.max(refundAmount, 0);

        // Restore product stock
        const product = await Product.findById(item.productId._id);
        if (product) {
            product.totalStock += item.quantity;
            await product.save();
        }

        // Update order amounts
        const originalOrderAmount = order.orderAmount || 0;
        order.orderAmount = originalOrderAmount - (item.totalProductPrice || 0);
        if (order.discountAmount && order.discountAmount > 0) {
            const remainingItems = order.orderedItem.filter(i => i.productStatus !== 'Cancelled');
            if (remainingItems.length > 0) {
                const remainingTotal = remainingItems.reduce((sum, i) => sum + (i.totalProductPrice || 0), 0);
                if (remainingTotal > 0) {
                    order.discountAmount = order.discountAmount * (remainingTotal / originalOrderAmount);
                } else {
                    order.discountAmount = 0;
                }
            } else {
                order.discountAmount = 0;
            }
        }
        order.finalAmount = (order.orderAmount || 0) - (order.discountAmount || 0) + (order.shippingCharge || 0);

        // Process refund if payment was made
        if (order.paymentStatus === 'Paid' && refundAmount > 0) {
            let wallet = await Wallet.findOne({ userId });
            if (!wallet) {
                wallet = new Wallet({ userId, balance: 0, transaction: [] });
            }

            wallet.balance = (wallet.balance || 0) + refundAmount;
            wallet.transaction.push({
                amount: refundAmount,
                transactionsMethod: 'Refund',
                description: `Refund for cancelled product (Order: ${order.orderNumber}, Product ID: ${productId})`,
                orderId: order._id,
                date: new Date()
            });

            await wallet.save();
        }

        // Update order status if all items are cancelled
        const allCancelled = order.orderedItem.every(
            (item) => item.productStatus === 'Cancelled'
        );
        if (allCancelled) {
            order.orderStatus = 'Cancelled';
            order.cancelReason = cancelReason || 'All items cancelled';
        }

        // Save the order
        await order.save();

        res.status(200).json({
            success: true,
            message: 'Product cancelled successfully',
            refundAmount: order.paymentStatus === 'Paid' ? refundAmount : 0
        });
    } catch (error) {
        console.error('Error cancelling product:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
};

// Cancel entire order
exports.cancelOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { cancelReason } = req.body;
        const userId = req.user.id;

        // Validate user authentication
        if (!userId) {
            return res.status(401).json({ success: false, message: 'User not authenticated' });
        }

        // Find the order
        const order = await Orders.findById(orderId).populate('orderedItem.productId');
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Check if userId exists in the order
        if (!order.userId) {
            console.error(`Order ${orderId} is missing userId`);
            return res.status(400).json({ success: false, message: 'Invalid order: missing user information' });
        }

        // Check if the order belongs to the user
        if (order.userId.toString() !== userId.toString()) {
            return res.status(403).json({ success: false, message: 'Unauthorized action' });
        }

        // Check if the order can be cancelled
        if (!['Pending', 'Shipped'].includes(order.orderStatus)) {
            return res.status(400).json({
                success: false,
                message: 'Order cannot be cancelled in current status'
            });
        }

        // Update order status and cancellation reason
        order.orderStatus = 'Cancelled';
        order.cancelReason = cancelReason || 'No reason provided';

        // Update all ordered items to cancelled and restore stock
        for (const item of order.orderedItem) {
            if (['Pending', 'Shipped'].includes(item.productStatus)) {
                item.productStatus = 'Cancelled';
                item.cancelReason = cancelReason || 'Order cancelled';

                // Restore product stock
                const product = await Product.findById(item.productId._id);
                if (product) {
                    product.totalStock += item.quantity;
                    await product.save();
                }
            }
        }

        // Calculate refund amount (final amount after discounts)
        const refundAmount = order.finalAmount || 0;

        // Process refund if payment was made
        if (order.paymentStatus === 'Paid' && refundAmount > 0) {
            let wallet = await Wallet.findOne({ userId });
            if (!wallet) {
                wallet = new Wallet({ userId, balance: 0, transaction: [] });
            }

            wallet.balance = (wallet.balance || 0) + refundAmount;
            wallet.transaction.push({
                amount: refundAmount,
                transactionsMethod: 'Refund',
                description: `Refund for cancelled order (Order: ${order.orderNumber})`,
                orderId: order._id,
                date: new Date()
            });

            await wallet.save();
        }

        // Save the order
        await order.save();

        res.status(200).json({
            success: true,
            message: 'Order cancelled successfully',
            refundAmount: order.paymentStatus === 'Paid' ? refundAmount : 0
        });
    } catch (error) {
        console.error('Error cancelling order:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
};