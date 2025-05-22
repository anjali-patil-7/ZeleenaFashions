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
        // Use query parameters instead of body for pagination compatibility
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
exports.generatePDF = (req, res, orders, summary, page, fromDate = null, toDate = null) => {
    try {
        const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${page}_sales_report.pdf`);

        doc.pipe(res);

        // Branding and Header
        doc.font('Helvetica-Bold').fontSize(24).fillColor('#2c3e50')
           .text('Zeleena Fashions', 40, 40, { align: 'left' });
        
        doc.font('Helvetica').fontSize(10).fillColor('#7f8c8d')
           .text('123 Fashion Avenue, Style City, SC 12345', 40, 70)
           .text('Phone: +1 (555) 123-4567 | Email: contact@zeleenafashions.com', 40, 85)
           .text('Website: www.zeleenafashions.com | GSTIN: 12ABCDE1234F1Z5', 40, 100);
        
        doc.font('Helvetica-Bold').fontSize(28).fillColor('#34495e')
           .text('SALES REPORT', 0, 40, { align: 'right' });
        
        doc.moveTo(40, 130).lineTo(555, 130).lineWidth(1).fillAndStroke('#3498db');
        doc.moveDown(2);

        // Summary Section
        doc.font('Helvetica-Bold').fontSize(14).fillColor('#2c3e50')
           .text('Summary', 40, doc.y, { underline: true });
        doc.font('Helvetica').fontSize(10).fillColor('#34495e');
        let yPosition = doc.y + 10;
        
        doc.text(`Generated on: ${moment().format('MMMM Do YYYY, h:mm:ss a')}`, 40, yPosition);
        yPosition += 15;
        if (page === 'customDate') {
            doc.text(`Period: ${formatDate(fromDate)} to ${formatDate(toDate)}`, 40, yPosition);
        } else {
            doc.text(`Period: ${page.charAt(0).toUpperCase() + page.slice(1)}`, 40, yPosition);
        }
        yPosition += 15;
        doc.text(`Total Orders: ${summary.TotalSaleCount}`, 40, yPosition);
        yPosition += 15;
        doc.text(`Total Revenue: ₹${summary.TotalAmount.toFixed(2)}`, 40, yPosition);
        yPosition += 15;
        doc.text(`Total Discount: ₹${summary.TotalDiscountAmount.toFixed(2)}`, 40, yPosition);
        yPosition += 15;
        doc.text(`Net Revenue: ₹${(summary.TotalAmount - summary.TotalDiscountAmount).toFixed(2)}`, 40, yPosition);
        yPosition += 20;

        // Orders Table
        doc.font('Helvetica-Bold').fontSize(14).fillColor('#2c3e50')
           .text('Order Details', 40, yPosition, { underline: true });
        
        yPosition += 15;
        if (yPosition > 650) {
            doc.addPage();
            yPosition = 50;
        }

        // Updated table header with Order Status
        doc.rect(40, yPosition, 515, 25).fill('#f5f6fa');
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#2c3e50');
        doc.text('SI No', 50, yPosition + 8, { width: 40 })
           .text('Order Date', 90, yPosition + 8, { width: 80 })
           .text('Customer Name', 170, yPosition + 8, { width: 120 })
           .text('Order ID', 290, yPosition + 8, { width: 80 })
           .text('Order Amount', 370, yPosition + 8, { width: 50, align: 'right' })
           .text('Discount', 420, yPosition + 8, { width: 50, align: 'right' })
           .text('Status', 470, yPosition + 8, { width: 80, align: 'left' });

        yPosition += 30;
        doc.font('Helvetica').fontSize(10).fillColor('#000000');

        if (orders && orders.length > 0) {
            orders.forEach((order, index) => {
                if (yPosition > 700) {
                    doc.addPage();
                    yPosition = 50;
                }

                if (index % 2 === 0) {
                    doc.rect(40, yPosition, 515, 20).fill('#f9fbfd');
                }

                const siNo = index + 1;
                const orderDate = order.orderDate;
                const customerName = order.userId?.name || 'N/A';
                const orderId = order.orderNumber || order._id;
                const orderAmount = (order.orderAmount || 0).toFixed(2);
                const discount = (order.couponDiscount || 0).toFixed(2);
                const orderStatus = order.orderStatus || 'N/A';

                doc.text(`${siNo}`, 50, yPosition + 5, { width: 40 });
                doc.text(orderDate, 90, yPosition + 5, { width: 80 });
                doc.text(customerName, 170, yPosition + 5, { width: 120 });
                doc.text(orderId, 290, yPosition + 5, { width: 80 });
                doc.text(`₹${orderAmount}`, 370, yPosition + 5, { width: 50, align: 'right' });
                doc.text(`₹${discount}`, 420, yPosition + 5, { width: 50, align: 'right' });
                doc.text(orderStatus, 470, yPosition + 5, { width: 80, align: 'left' });

                yPosition += 20;
            });
        } else {
            doc.text('No orders available', 50, yPosition + 5, { width: 250 });
            yPosition += 20;
        }

        doc.moveTo(40, yPosition).lineTo(555, yPosition).lineWidth(0.5).stroke('#3498db');
        yPosition += 20;

        // Footer
        doc.font('Helvetica-Oblique').fontSize(9).fillColor('#7f8c8d');
        const footerPosition = doc.page.height - 60;
        doc.text('Thank you for shopping with Zeleena Fashions!', 0, footerPosition, { align: 'center' })
           .text(`Generated on ${moment().format('MMMM Do YYYY, h:mm:ss a')} | All rights reserved © 2025`, 0, footerPosition + 15, { align: 'center' });

        doc.end();
    } catch (error) {
        console.error('Error in generatePDF:', error);
        res.status(500).send(`Failed to generate PDF report: ${error.message}`);
    }
};

// Generate Excel Report
exports.generateExcel = async (req, res, orders, summary, page, fromDate = null, toDate = null) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Sales Report');

        // Define columns
        worksheet.columns = [
            { header: 'SI No', key: 'siNo', width: 10 },
            { header: 'Order Date', key: 'orderDate', width: 15 },
            { header: 'Customer Name', key: 'customerName', width: 20 },
            { header: 'Order ID', key: 'orderId', width: 20 },
            { header: 'Order Amount', key: 'orderAmount', width: 15 },
            { header: 'Discount', key: 'discount', width: 15 },
            { header: 'Status', key: 'orderStatus', width: 15 }
        ];

        // Add summary
        worksheet.addRow(['Summary']);
        worksheet.addRow(['Total Orders', summary.TotalSaleCount]);
        worksheet.addRow(['Total Revenue', `₹${summary.TotalAmount.toFixed(2)}`]);
        worksheet.addRow(['Total Discount', `₹${summary.TotalDiscountAmount.toFixed(2)}`]);
        worksheet.addRow(['Net Revenue', `₹${(summary.TotalAmount - summary.TotalDiscountAmount).toFixed(2)}`]);
        worksheet.addRow([]);
        if (page === 'customDate') {
            worksheet.addRow(['Period', `${formatDate(fromDate)} to ${formatDate(toDate)}`]);
        } else {
            worksheet.addRow(['Period', page.charAt(0).toUpperCase() + page.slice(1)]);
        }
        worksheet.addRow([]);

        // Add orders
        orders.forEach((order, index) => {
            worksheet.addRow({
                siNo: index + 1,
                orderDate: order.orderDate,
                customerName: order.userId?.name || 'N/A',
                orderId: order.orderNumber || order._id,
                orderAmount: `₹${(order.orderAmount || 0).toFixed(2)}`,
                discount: `₹${(order.couponDiscount || 0).toFixed(2)}`,
                orderStatus: order.orderStatus || 'N/A'
            });
        });

        // Styling
        worksheet.getRow(1).font = { bold: true, size: 14 };
        worksheet.getRow(7).font = { bold: true };
        worksheet.getRow(8).font = { bold: true };
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber <= 8) {
                row.font = { bold: true };
            }
            row.eachCell(cell => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
        });

        // Set headers
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${page}_sales_report.xlsx`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error in generateExcel:', error);
        res.status(500).send(`Failed to generate Excel report: ${error.message}`);
    }
};