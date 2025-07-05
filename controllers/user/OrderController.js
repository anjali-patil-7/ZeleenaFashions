const Orders = require('../../models/orderSchema');
const Address = require('../../models/addressSchema');
const Product = require('../../models/productSchema');
const Wallet = require('../../models/walletSchema');
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');

// List all orders for a user with optional search
exports.getOrders = async (req, res) => {
    try {
        const userId = req.session.user.id;
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
            user: req.session.user.id
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).render('error', { message: 'Failed to load orders' });
    }
};

// Get order details
exports.getOrderDetails = async (req, res) => {
    try {
        const userId = req.session.user.id;
        if (!userId) {
            return res.redirect('/login');
        }

        const orderId = req.params.orderId;
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(404).render('error', { message: 'Invalid order ID' });
        }

        const order = await Orders.findOne({ _id: orderId, userId })
            .populate('orderedItem.productId')
            .populate('deliveryAddress')
            .populate('couponApplied')
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

// Cancel entire order
exports.cancelOrder = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { orderId } = req.params;
        const { cancelReason } = req.body;
        const userId = req.session.user.id;

        if (!userId) {
            await session.abortTransaction();
            session.endSession();
            return res.status(401).json({ success: false, message: 'User not authenticated' });
        }

        const order = await Orders.findById(orderId)
            .populate('orderedItem.productId')
            .session(session);
        if (!order) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (!order.userId) {
            console.error(`Order ${orderId} is missing userId`);
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ success: false, message: 'Invalid order: missing user information' });
        }

        if (order.userId.toString() !== userId.toString()) {
            await session.abortTransaction();
            session.endSession();
            return res.status(403).json({ success: false, message: 'Unauthorized action' });
        }

        if (!['Pending', 'Shipped'].includes(order.orderStatus)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                message: 'Order cannot be cancelled in current status'
            });
        }

        order.orderStatus = 'Cancelled';
        order.cancelReason = cancelReason || 'No reason provided';

        let refundAmount = 0;
        const totalOrderAmount = order.orderAmount || 0;
        const totalDiscount = (order.discountAmount || 0) + (order.couponDiscount || 0);

        for (const item of order.orderedItem) {
            if (['Pending', 'Shipped'].includes(item.productStatus)) {
                item.productStatus = 'Cancelled';
                item.cancelReason = cancelReason || 'Order cancelled';

                const product = await Product.findById(item.productId._id).session(session);
                if (product) {
                    product.totalStock += item.quantity;
                    await product.save({ session });
                }

                if (totalOrderAmount > 0) {
                    const itemProportion = item.totalProductPrice / totalOrderAmount;
                    const itemDiscount = totalDiscount * itemProportion;
                    refundAmount += item.totalProductPrice - itemDiscount;
                } else {
                    refundAmount += item.totalProductPrice;
                }
            }
        }

        if (order.paymentStatus === 'Paid' && refundAmount > 0) {
            let wallet = await Wallet.findOne({ userId }).session(session);
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

            await wallet.save({ session });
        }

        await order.save({ session });

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({
            success: true,
            message: 'Order cancelled successfully',
            refundAmount: order.paymentStatus === 'Paid' ? refundAmount : 0
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Error cancelling order:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
};

// Cancel single product
exports.cancelSingleProduct = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { orderId, productId } = req.params;
        const { cancelReason } = req.body;
        const userId = req.session.user.id;

        if (!userId) {
            await session.abortTransaction();
            session.endSession();
            return res.status(401).json({ success: false, message: 'User not authenticated' });
        }

        const order = await Orders.findById(orderId)
            .populate('orderedItem.productId')
            .session(session);
        if (!order) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (!order.userId) {
            console.error(`Order ${orderId} is missing userId`);
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ success: false, message: 'Invalid order: missing user information' });
        }

        if (order.userId.toString() !== userId.toString()) {
            await session.abortTransaction();
            session.endSession();
            return res.status(403).json({ success: false, message: 'Unauthorized action' });
        }

        const item = order.orderedItem.find(
            (item) => item._id.toString() === productId
        );
        if (!item) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ success: false, message: 'Product not found in order' });
        }

        if (!['Pending', 'Shipped'].includes(item.productStatus)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                message: 'Product cannot be cancelled in current status'
            });
        }

        item.productStatus = 'Cancelled';
        item.cancelReason = cancelReason || 'No reason provided';

        const product = await Product.findById(item.productId._id).session(session);
        if (product) {
            product.totalStock += item.quantity;
            await product.save({ session });
        }

        const totalOrderAmount = order.orderAmount || 0;
        const totalDiscount = (order.discountAmount || 0) + (order.couponDiscount || 0);
        let refundAmount = item.totalProductPrice || 0;

        if (totalOrderAmount > 0) {
            const itemProportion = item.totalProductPrice / totalOrderAmount;
            const itemDiscount = totalDiscount * itemProportion;
            refundAmount = item.totalProductPrice - itemDiscount;
        }
        refundAmount = Math.max(refundAmount, 0);

        if (order.paymentStatus === 'Paid' && refundAmount > 0) {
            let wallet = await Wallet.findOne({ userId }).session(session);
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

            await wallet.save({ session });
        }

        order.orderAmount = (order.orderAmount || 0) - (item.totalProductPrice || 0);
        const remainingItems = order.orderedItem.filter(i => i.productStatus !== 'Cancelled');
        if (remainingItems.length > 0) {
            const remainingTotal = remainingItems.reduce((sum, i) => sum + (i.totalProductPrice || 0), 0);
            if (remainingTotal > 0 && totalOrderAmount > 0) {
                order.discountAmount = (order.discountAmount || 0) * (remainingTotal / totalOrderAmount);
                order.couponDiscount = (order.couponDiscount || 0) * (remainingTotal / totalOrderAmount);
            } else {
                order.discountAmount = 0;
                order.couponDiscount = 0;
            }
            order.finalAmount = (order.orderAmount || 0) - (order.discountAmount || 0) - (order.couponDiscount || 0) + (order.shippingCharge || 0);
        } else {
            order.orderStatus = 'Cancelled';
            order.cancelReason = cancelReason || 'All items cancelled';
            order.discountAmount = 0;
            order.couponDiscount = 0;
            order.finalAmount = 0;
            order.shippingCharge = 0;
        }

        await order.save({ session });

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({
            success: true,
            message: 'Product cancelled successfully',
            refundAmount: order.paymentStatus === 'Paid' ? refundAmount : 0
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Error cancelling product:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
};

// Download invoice
exports.downloadInvoice = async (req, res) => {
    try {
        console.log('Download invoice route hit');
        if (!req.user || !req.user.id) {
            console.error('User not authenticated');
            return res.status(401).send('Authentication required');
        }
        
        const userId = req.session.user.id;
        const orderId = req.params.orderId;
        console.log('Downloading invoice for user:', userId, 'order:', orderId);

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            console.log('Invalid order ID format:', orderId);
            return res.status(400).send('Invalid order ID format');
        }

        console.log('Searching for order in database...');
        const order = await Orders.findOne({ _id: orderId, userId })
            .populate({
                path: 'orderedItem.productId',
                select: 'productName price',
                match: { productName: { $exists: true } }
            })
            .populate('deliveryAddress')
            .populate('appliedOffer')
            .populate('couponApplied')
            .lean();

        console.log('Full order object:', JSON.stringify(order, null, 2));
        console.log('Ordered items:', order?.orderedItem ? JSON.stringify(order.orderedItem, null, 2) : 'Not found');

        if (!order || !order.orderedItem || order.orderedItem.length === 0) {
            console.log('Order or ordered items not found for ID:', orderId, 'user:', userId);
            return res.status(404).send('Order or ordered items not found');
        }

        const hasValidItems = order.orderedItem.every(item => item.productId && item.productId.productName);
        if (!hasValidItems) {
            console.log('Some ordered items are missing product data');
            return res.status(400).send('Invalid product data in order');
        }

        console.log('Order found, generating PDF...');
        const doc = new PDFDocument({
            size: 'A4',
            margin: 40,
            bufferPages: true
        });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.orderNumber || orderId}.pdf`);
        
        doc.pipe(res);

        // Company Header
        doc.font('Helvetica-Bold').fontSize(24).fillColor('#2c3e50')
           .text('Zeleena Fashions', 40, 40, { align: 'left' });
        
        doc.font('Helvetica').fontSize(10).fillColor('#7f8c8d')
           .text('123 Fashion Avenue, Style City, SC 12345', 40, 70)
           .text('Phone: +1 (555) 123-4567 | Email: contact@zeleenafashions.com', 40, 85)
           .text('Website: www.zeleenafashions.com | GSTIN: 12ABCDE1234F1Z5', 40, 100);
        
        // Invoice Title
        doc.font('Helvetica-Bold').fontSize(28).fillColor('#34495e')
           .text('INVOICE', 0, 40, { align: 'right' });
        
        doc.moveTo(40, 130).lineTo(555, 130).lineWidth(1).fillAndStroke('#3498db');
        doc.moveDown(2);

        // Order Details
        doc.font('Helvetica-Bold').fontSize(14).fillColor('#2c3e50')
           .text('Order Details', 40, doc.y, { underline: true });
        doc.font('Helvetica').fontSize(10).fillColor('#34495e');
        
        doc.text(`Order Number: ${order.orderNumber || order._id || 'N/A'}`, 40, doc.y + 10)
           .text(`Order Date: ${order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'N/A'}`, 40, doc.y + 5)
           .text(`Payment Method: ${order.paymentMethod || 'Cash on Delivery'}`, 40, doc.y + 5)
           .text(`Order Status: ${order.orderStatus || 'N/A'}`, 40, doc.y + 5);
        doc.moveDown(2);

        // Shipping Address
        const address = order.deliveryAddress;
        doc.font('Helvetica-Bold').fontSize(14).fillColor('#2c3e50')
           .text('Shipping Address', 40, doc.y, { underline: true });
        doc.font('Helvetica').fontSize(10).fillColor('#34495e');
        
        if (address) {
            doc.text(address.name || 'N/A', 40, doc.y + 10)
               .text(address.mobile || 'N/A', 40, doc.y + 5)
               .text([
                   address.houseName,
                   address.street,
                   address.city,
                   address.state,
                   address.pincode,
                   address.country
               ].filter(Boolean).join(', '), 40, doc.y + 5);
        } else {
            doc.text('Shipping Address: Not available', 40, doc.y + 10);
        }
        doc.moveDown(2);

        // Items Table Header
        doc.font('Helvetica-Bold').fontSize(14).fillColor('#2c3e50')
           .text('Ordered Items', 40, doc.y, { underline: true });
        
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
        
        doc.moveTo(40, yPosition).lineTo(555, yPosition).lineWidth(0.5).stroke('#3498db');
        yPosition += 20;
        console.log(`yPosition after items section: ${yPosition}`);

        // Price Summary
        doc.font('Helvetica-Bold').fontSize(14).fillColor('#2c3e50')
           .text('Price Summary', 350, yPosition, { underline: true });
        doc.font('Helvetica').fontSize(10).fillColor('#34495e');
        yPosition += 20;
        
        doc.text('Items Total:', 350, yPosition)
           .text(`₹${(order.orderAmount || 0).toFixed(2)}`, 480, yPosition, { align: 'right' });
        yPosition += 15;

        if (order.shippingCharge) {
            doc.text('Shipping Charge:', 350, yPosition)
               .text(`₹${order.shippingCharge.toFixed(2)}`, 480, yPosition, { align: 'right' });
            yPosition += 15;
        } else {
            doc.text('Shipping Charge:', 350, yPosition)
               .text('₹100.00', 480, yPosition, { align: 'right' });
            yPosition += 15;
        }

        if (order.couponDiscount && order.couponCode) {
            const couponName = order.couponApplied ? order.couponApplied.code : order.couponCode;
            doc.text(`Coupon Discount (${couponName}):`, 350, yPosition)
               .text(`-₹${order.couponDiscount.toFixed(2)}`, 480, yPosition, { align: 'right' });
            yPosition += 15;
        }

        if (order.discountAmount) {
            doc.text('Offer Discount:', 350, yPosition)
               .text(`-₹${order.discountAmount.toFixed(2)}`, 480, yPosition, { align: 'right' });
            yPosition += 15;
        }

        doc.moveTo(350, yPosition).lineTo(555, yPosition).lineWidth(0.5).stroke('#3498db');
        yPosition += 15;
        
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#2c3e50')
           .text('Final Amount:', 350, yPosition)
           .text(`₹${(order.finalAmount || 0).toFixed(2)}`, 480, yPosition, { align: 'right' });
        
        // Footer
        doc.font('Helvetica-Oblique').fontSize(9).fillColor('#7f8c8d');
        const footerPosition = doc.page.height - 60;
        doc.text('Thank you for shopping with Zeleena Fashions!', 0, footerPosition, { align: 'center' })
           .text(`Generated on ${new Date().toLocaleString()} | All rights reserved © 2025`, 0, footerPosition + 15, { align: 'center' });

        doc.flushPages();
        doc.end();
        console.log('Invoice generated successfully for order:', orderId);
    } catch (error) {
        console.error('Error generating invoice:', error);
        res.status(500).send(`Failed to generate invoice: ${error.message}`);
    }
};

// Return request
exports.requestReturn = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { productId, returnReason } = req.body;

        if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ success: false, message: 'Invalid order or product ID' });
        }

        if (!returnReason || returnReason.trim() === '') {
            return res.status(400).json({ success: false, message: 'Return reason is required' });
        }

        const order = await Orders.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const orderedItem = order.orderedItem.find(
            item => item._id.toString() === productId
        );

        if (!orderedItem) {
            return res.status(404).json({ success: false, message: 'Product not found in order' });
        }

        if (orderedItem.productStatus !== 'Delivered') {
            return res.status(400).json({ success: false, message: 'Item is not eligible for return' });
        }

        if (orderedItem.returnRequestDate) {
            return res.status(400).json({ success: false, message: 'Return already requested for this item' });
        }

        orderedItem.productStatus = 'Return Requested';
        orderedItem.returnReason = returnReason;
        orderedItem.returnRequestDate = new Date();

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
        const userId = req.session.user.id;
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

// Render success page
exports.renderSuccessPage = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const order = await Orders.findById(orderId);
        if (!order) {
            return res.redirect('/orders');
        }
        res.render('user/confirmorder', { orderId, order });
    } catch (error) {
        console.error('Error rendering success page:', error);
        res.redirect('/orders');
    }
};

// Render failure page
exports.renderFailurePage = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        res.render('user/order-failure', { orderId });
    } catch (error) {
        console.error('Error rendering failure page:', error);
        res.status(500).send('Internal Server Error');
    }
};

// Render orders page
exports.renderOrdersPage = async (req, res) => {
    try {
        const orders = await Orders.find({ user: req.user._id });
        res.render('user/orders', { orders });
    } catch (error) {
        console.error('Error rendering orders page:', error);
        res.status(500).send('Internal Server Error');
    }
};

// Place order
exports.placeOrder = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const userId = req.session.user.id;
        if (!userId) {
            await session.abortTransaction();
            session.endSession();
            return res.status(401).json({ success: false, message: 'User not authenticated' });
        }

        const { addressId, paymentMethod, couponCode } = req.body;
        if (!addressId || !paymentMethod) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ success: false, message: 'Address and payment method are required' });
        }

        // Validate address
        const address = await Address.findById(addressId).session(session);
        if (!address || address.userId.toString() !== userId.toString()) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ success: false, message: 'Invalid address' });
        }

        // Fetch cart
        const Cart = require('../../models/cartSchema'); // Adjust path as needed
        const cart = await Cart.findOne({ userId }).populate('items.productId').session(session);
        if (!cart || !cart.items || cart.items.length === 0) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ success: false, message: 'Cart is empty' });
        }

        // Calculate order totals
        let orderAmount = 0;
        let discountAmount = 0;
        let couponDiscount = 0;
        let shippingCharge = 50; // Adjust based on your logic
        const orderedItems = [];

        for (const item of cart.items) {
            if (!item.productId) continue;
            const product = item.productId;
            const unitPrice = product.price || 0;
            const quantity = item.quantity || 1;
            let totalProductPrice = unitPrice * quantity;

            // Apply product offer if exists
            if (product.offer && product.offer.discount > 0) {
                const discount = (product.offer.discount / 100) * totalProductPrice;
                discountAmount += discount;
                totalProductPrice -= discount;
            }

            orderAmount += totalProductPrice;
            orderedItems.push({
                productId: product._id,
                quantity,
                unitPrice,
                totalProductPrice,
                productStatus: 'Pending'
            });

            // Update product stock
            product.totalStock -= quantity;
            if (product.totalStock < 0) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ success: false, message: `Insufficient stock for ${product.productName}` });
            }
            await product.save({ session });
        }

        // Apply coupon if provided
        if (couponCode) {
            const Coupon = require('../../models/couponSchema'); // Adjust path as needed
            const coupon = await Coupon.findOne({ code: couponCode }).session(session);
            if (!coupon) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ success: false, message: 'Invalid coupon code' });
            }
            if (coupon.minimumPrice > orderAmount) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ success: false, message: `Minimum purchase of ₹${coupon.minimumPrice} required for this coupon` });
            }
            if (coupon.expiry && new Date(coupon.expiry) < new Date()) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ success: false, message: 'Coupon has expired' });
            }
            if (coupon.discountType === 'percentage') {
                couponDiscount = (coupon.discount / 100) * orderAmount;
                if (coupon.maxDiscount) {
                    couponDiscount = Math.min(couponDiscount, coupon.maxDiscount);
                }
            } else {
                couponDiscount = coupon.discount;
            }
        }

        // Calculate final amount
        const finalAmount = orderAmount - discountAmount - couponDiscount + shippingCharge;

        // Validate CoD restriction
        if (finalAmount > 1000 && paymentMethod === 'cod') {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                message: 'Cash on Delivery is not available for orders above ₹1000'
            });
        }

        // Validate wallet payment
        if (paymentMethod === 'wallet') {
            const wallet = await Wallet.findOne({ userId }).session(session);
            if (!wallet || wallet.balance < finalAmount) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
            }
            wallet.balance -= finalAmount;
            wallet.transaction.push({
                amount: -finalAmount,
                transactionsMethod: 'Order Payment',
                description: `Payment for order`,
                orderId: null, // Will be updated
                date: new Date()
            });
            await wallet.save({ session });
        }

        // Create order
        const order = new Orders({
            userId,
            orderNumber: `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            deliveryAddress: addressId,
            orderedItem: orderedItems,
            orderAmount,
            discountAmount,
            couponDiscount,
            shippingCharge,
            finalAmount,
            paymentMethod,
            paymentStatus: paymentMethod === 'cod' ? 'Pending' : 'Paid',
            orderStatus: 'Pending',
            couponCode: couponCode || null
        });

        await order.save({ session });

        // Update wallet transaction with orderId
        if (paymentMethod === 'wallet') {
            const wallet = await Wallet.findOne({ userId }).session(session);
            wallet.transaction[wallet.transaction.length - 1].orderId = order._id;
            await wallet.save({ session });
        }

        // Clear cart
        await Cart.deleteOne({ userId }).session(session);

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({
            success: true,
            message: 'Order placed successfully',
            redirectUrl: `/user/confirmorder/${order._id}`
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Error placing order:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
};