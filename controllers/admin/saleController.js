const mongoose = require('mongoose');
const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const moment = require('moment');

// Helper function to format dates
const formatDate = (date) => moment(date).format('YYYY-MM-DD');

// Helper function to calculate summary
const calculateSummary = async (query) => {
    const orders = await Order.find(query).lean();
    return {
        TotalAmount: orders.reduce((sum, order) => sum + (order.finalAmount || 0), 0),
        TotalDiscountAmount: orders.reduce((sum, order) => sum + (order.couponDiscount || 0), 0),
        TotalSaleCount: orders.length
    };
};

// Render Sales Report
exports.getSalesReport = async (req, res) => {
    try {
        const { period } = req.params; 
        const { format, page: currentPage = 1 } = req.query; 
        const perPage = 10;
        let query = {};

        // Validate period parameter
        const validPeriods = ['daily', 'weekly', 'monthly', 'yearly'];
        const page = validPeriods.includes(period) ? period : 'daily'; 
        console.log(`Processing sales report for period: ${page}, page: ${currentPage}`);

        // Date range filtering
        if (page === 'daily') {
            query.createdAt = {
                $gte: moment().startOf('day').toDate(),
                $lte: moment().endOf('day').toDate()
            };
        } else if (page === 'weekly') {
            query.createdAt = {
                $gte: moment().startOf('week').toDate(),
                $lte: moment().endOf('week').toDate()
            };
        } else if (page === 'monthly') {
            query.createdAt = {
                $gte: moment().startOf('month').toDate(),
                $lte: moment().endOf('month').toDate()
            };
        } else if (page === 'yearly') {
            query.createdAt = {
                $gte: moment().startOf('year').toDate(),
                $lte: moment().endOf('year').toDate()
            };
        }

        // Log the query date range
        console.log(`Query date range: ${JSON.stringify(query.createdAt)}`);

        // Fetch total orders for pagination
        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / perPage);
        console.log(`Total orders: ${totalOrders}, Total pages: ${totalPages}`);

        // Calculate summary for all orders in the period
        const summary = await calculateSummary(query);
        console.log(`Summary: ${JSON.stringify(summary)}`);

        // Fetch paginated orders
        let orders = await Order.find(query)
            .populate('userId', 'name email')
            .sort({ createdAt: -1 })
            .skip((parseInt(currentPage) - 1) * perPage)
            .limit(perPage)
            .lean();

        // Add formatted orderDate and orderStatus
        orders = orders.map(order => ({
            ...order,
            orderDate: formatDate(order.createdAt),
            orderStatus: order.orderStatus || 'N/A'
        }));

        if (format === 'pdf') {
            return exports.generatePDF(req, res, orders, summary, page);
        } else if (format === 'excel') {
            return exports.generateExcel(req, res, orders, summary, page);
        }

        res.render('admin/salesreport', {
            page,
            orders,
            TotalAmount: summary.TotalAmount,
            TotalDiscountAmount: summary.TotalDiscountAmount,
            TotalSaleCount: summary.TotalSaleCount,
            error: orders.length === 0 ? 'No orders found for the selected period.' : null,
            fromDate: null,
            toDate: null,
            currentPage: parseInt(currentPage),
            totalPages,
            perPage
        });
    } catch (error) {
        console.error('Error in getSalesReport:', error);
        res.status(500).render('admin/salesreport', {
            page: req.params.period || 'daily',
            orders: [],
            TotalAmount: 0,
            TotalDiscountAmount: 0,
            TotalSaleCount: 0,
            error: `An error occurred while fetching the sales report: ${error.message}`,
            fromDate: null,
            toDate: null,
            currentPage: 1,
            totalPages: 0,
            perPage: 10
        });
    }
};

// Custom Date Sales Report
exports.getCustomDateReport = async (req, res) => {
    try {
        const { fromDate, toDate, format, page: currentPage = 1 } = req.query;
        const perPage = 10;

        console.log(`Custom date report requested: fromDate=${fromDate}, toDate=${toDate}, page=${currentPage}`);

        if (!fromDate || !toDate) {
            console.log('Missing fromDate or toDate');
            return res.status(400).render('admin/salesreport', {
                page: 'customDate',
                orders: [],
                TotalAmount: 0,
                TotalDiscountAmount: 0,
                TotalSaleCount: 0,
                error: 'Please provide both start and end dates.',
                fromDate,
                toDate,
                currentPage: 1,
                totalPages: 0,
                perPage
            });
        }

        const startDate = moment(fromDate).startOf('day').toDate();
        const endDate = moment(toDate).endOf('day').toDate();

        if (endDate < startDate) {
            console.log('End date is earlier than start date');
            return res.status(400).render('admin/salesreport', {
                page: 'customDate',
                orders: [],
                TotalAmount: 0,
                TotalDiscountAmount: 0,
                TotalSaleCount: 0,
                error: 'End date cannot be earlier than start date.',
                fromDate,
                toDate,
                currentPage: 1,
                totalPages: 0,
                perPage
            });
        }

        // Fetch total orders for pagination
        const query = { createdAt: { $gte: startDate, $lte: endDate } };
        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / perPage);
        console.log(`Custom date - Total orders: ${totalOrders}, Total pages: ${totalPages}`);

        // Calculate summary for all orders in the period
        const summary = await calculateSummary(query);
        console.log(`Custom date - Summary: ${JSON.stringify(summary)}`);

        // Fetch paginated orders
        let orders = await Order.find(query)
            .populate('userId', 'name email')
            .sort({ createdAt: -1 })
            .skip((parseInt(currentPage) - 1) * perPage)
            .limit(perPage)
            .lean();

        // Add formatted orderDate and orderStatus
        orders = orders.map(order => ({
            ...order,
            orderDate: formatDate(order.createdAt),
            orderStatus: order.orderStatus || 'N/A'
        }));

        if (format === 'pdf') {
            return exports.generatePDF(req, res, orders, summary, 'customDate', fromDate, toDate);
        } else if (format === 'excel') {
            return exports.generateExcel(req, res, orders, summary, 'customDate', fromDate, toDate);
        }

        res.render('admin/salesreport', {
            page: 'customDate',
            orders,
            TotalAmount: summary.TotalAmount,
            TotalDiscountAmount: summary.TotalDiscountAmount,
            TotalSaleCount: summary.TotalSaleCount,
            error: orders.length === 0 ? 'No orders found for the selected date range.' : null,
            fromDate,
            toDate,
            currentPage: parseInt(currentPage),
            totalPages,
            perPage
        });
    } catch (error) {
        console.error('Error in getCustomDateReport:', error);
        res.status(500).render('admin/salesreport', {
            page: 'customDate',
            orders: [],
            TotalAmount: 0,
            TotalDiscountAmount: 0,
            TotalSaleCount: 0,
            error: `An error occurred while fetching the custom date report: ${error.message}`,
            fromDate: req.query.fromDate || '',
            toDate: req.query.toDate || '',
            currentPage: 1,
            totalPages: 0,
            perPage: 10
        });
    }
};

// Check Data Existence for Custom Date
exports.checkDataExist = async (req, res) => {
    try {
        const { fromDate, toDate } = req.query;

        console.log(`Checking data existence: fromDate=${fromDate}, toDate=${toDate}`);

        if (!fromDate || !toDate) {
            return res.json({ success: false, message: 'Please provide both start and end dates.' });
        }

        const startDate = moment(fromDate).startOf('day').toDate();
        const endDate = moment(toDate).endOf('day').toDate();

        if (endDate < startDate) {
            return res.json({ success: false, message: 'End date cannot be earlier than start date.' });
        }

        const orders = await Order.find({
            createdAt: { $gte: startDate, $lte: endDate }
        }).limit(1);

        console.log(`Data existence check: ${orders.length} orders found`);

        if (orders.length === 0) {
            return res.json({ success: false, message: 'No orders found for the selected date range.' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error in checkDataExist:', error);
        res.json({ success: false, message: `An error occurred while checking data availability: ${error.message}` });
    }
};

// Generate PDF Report
exports.generatePDF = (req, res, orders, summary, period, fromDate = null, toDate = null) => {
    try {
        const doc = new PDFDocument();
        const filename = `Sales_Report_${period}_${Date.now()}.pdf`;

        // Set response headers for PDF download
        res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-type', 'application/pdf');

        // Pipe the PDF document to the response
        doc.pipe(res);

        // Add content to the PDF
        doc.fontSize(20).text('Sales Report', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Period: ${period.charAt(0).toUpperCase() + period.slice(1)}`);
        if (fromDate && toDate) {
            doc.text(`From: ${formatDate(fromDate)} To: ${formatDate(toDate)}`);
        }
        doc.moveDown();

        // Summary
        doc.text(`Total Sales: ${summary.TotalSaleCount}`);
        doc.text(`Total Amount: $${summary.TotalAmount.toFixed(2)}`);
        doc.text(`Total Discount: $${summary.TotalDiscountAmount.toFixed(2)}`);
        doc.moveDown();

        // Table Header
        doc.fontSize(10).text('Order ID', 50, 200);
        doc.text('Customer', 150, 200);
        doc.text('Date', 250, 200);
        doc.text('Amount', 350, 200);
        doc.text('Discount', 450, 200);
        doc.moveDown();

        // Table Content
        orders.forEach((order, index) => {
            const y = 220 + (index * 20);
            doc.text(order._id.toString(), 50, y);
            doc.text(order.userId ? order.userId.name : 'N/A', 150, y);
            doc.text(order.orderDate, 250, y);
            doc.text(`$${order.finalAmount.toFixed(2)}`, 350, y);
            doc.text(`$${order.couponDiscount ? order.couponDiscount.toFixed(2) : '0.00'}`, 450, y);
        });

        // Finalize the PDF
        doc.end();
    } catch (error) {
        console.error('Error in generatePDF:', error);
        res.status(500).send('Error generating PDF report');
    }
};

// Generate Excel Report
exports.generateExcel = async (req, res, orders, summary, period, fromDate = null, toDate = null) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Sales Report');

        // Add Summary
        worksheet.addRow(['Sales Report']);
        worksheet.addRow([`Period: ${period.charAt(0).toUpperCase() + period.slice(1)}`]);
        if (fromDate && toDate) {
            worksheet.addRow([`From: ${formatDate(fromDate)} To: ${formatDate(toDate)}`]);
        }
        worksheet.addRow(['Total Sales', summary.TotalSaleCount]);
        worksheet.addRow(['Total Amount', `$${summary.TotalAmount.toFixed(2)}`]);
        worksheet.addRow(['Total Discount', `$${summary.TotalDiscountAmount.toFixed(2)}`]);
        worksheet.addRow([]);

        // Add Table Headers
        worksheet.addRow(['Order ID', 'Customer', 'Date', 'Amount', 'Discount']);

        // Add Table Data
        orders.forEach(order => {
            worksheet.addRow([
                order._id.toString(),
                order.userId ? order.userId.name : 'N/A',
                order.orderDate,
                `$${order.finalAmount.toFixed(2)}`,
                `$${order.couponDiscount ? order.couponDiscount.toFixed(2) : '0.00'}`
            ]);
        });

        // Set response headers for Excel download
        const filename = `Sales_Report_${period}_${Date.now()}.xlsx`;
        res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        // Write to response
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error in generateExcel:', error);
        res.status(500).send('Error generating Excel report');
    }
};

// Generate Sales Report
exports.generateSalesReport = async (req, res) => {
    try {
        const { page = 'monthly', pageNumber = 1, fromDate, toDate } = req.query;
        const limit = 10; // Orders per page
        const skip = (pageNumber - 1) * limit;

        // Define date range
        let query = {};
        if (page === 'monthly') {
            query.createdAt = {
                $gte: moment().startOf('month').toDate(),
                $lte: moment().endOf('month').toDate()
            };
        } else if (page === 'customDate') {
            if (!fromDate || !toDate) {
                return res.status(400).json({ error: 'fromDate and toDate are required' });
            }
            query.createdAt = {
                $gte: moment(fromDate).startOf('day').toDate(),
                $lte: moment(toDate).endOf('day').toDate()
            };
        }

        // Fetch total count
        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limit);

        // Fetch orders for the current page
        const orders = await Order.find(query)
            .populate('userId', 'name')
            .skip(skip)
            .limit(limit)
            .lean();

        console.log(`Processing sales report for period: ${page}, page: ${pageNumber}`);
        console.log(`Query date range:`, query.createdAt);
        console.log(`Total orders: ${totalOrders}, Total pages: ${totalPages}`);
        console.log(`Orders for page ${pageNumber}:`, orders);

        // Calculate summary
        const allOrders = await Order.find(query).lean();
        const summary = {
            TotalSaleCount: totalOrders,
            TotalAmount: allOrders.reduce((sum, order) => sum + (order.finalAmount || 0), 0),
            TotalDiscountAmount: allOrders.reduce((sum, order) => sum + (order.couponDiscount || 0), 0)
        };
        console.log('Summary:', summary);

        // Add formatted orderDate and orderStatus
        const formattedOrders = orders.map(order => ({
            ...order,
            orderDate: formatDate(order.createdAt),
            orderStatus: order.orderStatus || 'N/A'
        }));

        // Generate PDF
        exports.generatePDF(req, res, formattedOrders, summary, page, query.createdAt.$gte, query.createdAt.$lte);
    } catch (error) {
        console.error('Error in generateSalesReport:', error);
        res.status(500).json({ error: 'Failed to generate sales report' });
    }
};