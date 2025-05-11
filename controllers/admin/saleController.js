const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const moment = require('moment');
const fs = require('fs');
const path = require('path');

// Helper function to format dates
const formatDate = (date) => moment(date).format('YYYY-MM-DD');
const formatMonthYear = (date) => moment(date).format('MMMM YYYY');
const formatYear = (date) => moment(date).format('YYYY');

// Helper function to aggregate data
const aggregateSalesData = (orders, period) => {
    const groupedData = {};
    orders.forEach(order => {
        let key;
        if (period === 'daily' || period === 'customDate') {
            key = formatDate(order.createdAt); // Use createdAt from timestamps
        } else if (period === 'weekly') {
            const startOfWeek = moment(order.createdAt).startOf('week').format('YYYY-MM-DD');
            const endOfWeek = moment(order.createdAt).endOf('week').format('YYYY-MM-DD');
            key = `${startOfWeek}_${endOfWeek}`;
        } else if (period === 'monthly') {
            key = formatMonthYear(order.createdAt);
        } else if (period === 'yearly') {
            key = formatYear(order.createdAt);
        }

        if (!groupedData[key]) {
            groupedData[key] = {
                dateFormatted: period === 'daily' || period === 'customDate' ? key : null,
                startOfWeek: period === 'weekly' ? key.split('_')[0] : null,
                endOfWeek: period === 'weekly' ? key.split('_')[1] : null,
                monthYear: period === 'monthly' ? key : null,
                year: period === 'yearly' ? key : null,
                totalOrderCount: 0,
                totalProducts: 0,
                totalDiscount: 0,
                totalSales: 0
            };
        }

        groupedData[key].totalOrderCount += 1;
        groupedData[key].totalProducts += order.orderedItem.reduce((sum, item) => sum + item.quantity, 0);
        groupedData[key].totalDiscount += order.couponDiscount || 0;
        groupedData[key].totalSales += order.finalAmount; // Use finalAmount from schema
    });

    return Object.values(groupedData);
};

// Helper function to calculate summary
const calculateSummary = (orders) => {
    return {
        TotalAmount: orders.reduce((sum, order) => sum + order.finalAmount, 0), // Use finalAmount
        TotalDiscountAmount: orders.reduce((sum, order) => sum + (order.couponDiscount || 0), 0),
        TotalSaleCount: orders.length
    };
};

// Render Sales Report
exports.getSalesReport = async (req, res) => {
    try {
        const { page = 'daily', format } = req.query;
        let reportData = [];
        let orders = [];
        let query = {};

        // Date range filtering using createdAt
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

        // Fetch orders
        orders = await Order.find(query)
            .populate('userId', 'name email')
            .lean();

        if (!orders.length && format !== 'pdf' && format !== 'excel') {
            return res.render('admin/salesreport', {
                page,
                reportData: [],
                TotalAmount: 0,
                TotalDiscountAmount: 0,
                TotalSaleCount: 0,
                error: 'No orders found for the selected period.',
                fromDate: null,
                toDate: null
            });
        }

        // Aggregate data
        reportData = aggregateSalesData(orders, page);
        const summary = calculateSummary(orders);

        if (format === 'pdf') {
            return exports.generatePDF(req, res, orders, summary, page);
        } else if (format === 'excel') {
            return exports.generateExcel(req, res, reportData, summary, page);
        }

        res.render('admin/salesreport', {
            page,
            reportData,
            TotalAmount: summary.TotalAmount,
            TotalDiscountAmount: summary.TotalDiscountAmount,
            TotalSaleCount: summary.TotalSaleCount,
            error: null,
            fromDate: null,
            toDate: null
        });
    } catch (error) {
        console.error('Error in getSalesReport:', error);
        res.status(500).render('admin/salesreport', {
            page: req.query.page || 'daily',
            reportData: [],
            TotalAmount: 0,
            TotalDiscountAmount: 0,
            TotalSaleCount: 0,
            error: 'An error occurred while fetching the sales report.',
            fromDate: null,
            toDate: null
        });
    }
};

// Custom Date Sales Report
exports.getCustomDateReport = async (req, res) => {
    try {
        const { fromDate, toDate } = req.body;
        const { format } = req.query;

        if (!fromDate || !toDate) {
            return res.status(400).render('admin/salesreport', {
                page: 'customDate',
                reportData: [],
                TotalAmount: 0,
                TotalDiscountAmount: 0,
                TotalSaleCount: 0,
                error: 'Please provide both start and end dates.',
                fromDate,
                toDate
            });
        }

        const startDate = moment(fromDate).startOf('day').toDate();
        const endDate = moment(toDate).endOf('day').toDate();

        if (endDate < startDate) {
            return res.status(400).render('admin/salesreport', {
                page: 'customDate',
                reportData: [],
                TotalAmount: 0,
                TotalDiscountAmount: 0,
                TotalSaleCount: 0,
                error: 'End date cannot be earlier than start date.',
                fromDate,
                toDate
            });
        }

        // Fetch orders
        const orders = await Order.find({
            createdAt: {
                $gte: startDate,
                $lte: endDate
            }
        })
            .populate('userId', 'name email')
            .lean();

        if (!orders.length && format !== 'pdf' && format !== 'excel') {
            return res.render('admin/salesreport', {
                page: 'customDate',
                reportData: [],
                TotalAmount: 0,
                TotalDiscountAmount: 0,
                TotalSaleCount: 0,
                error: 'No orders found for the selected date range.',
                fromDate,
                toDate
            });
        }

        // Aggregate data
        const reportData = aggregateSalesData(orders, 'customDate');
        const summary = calculateSummary(orders);

        if (format === 'pdf') {
            return exports.generatePDF(req, res, orders, summary, 'customDate', fromDate, toDate);
        } else if (format === 'excel') {
            return exports.generateExcel(req, res, reportData, summary, 'customDate', fromDate, toDate);
        }

        res.render('admin/salesreport', {
            page: 'customDate',
            reportData,
            TotalAmount: summary.TotalAmount,
            TotalDiscountAmount: summary.TotalDiscountAmount,
            TotalSaleCount: summary.TotalSaleCount,
            error: null,
            fromDate,
            toDate
        });
    } catch (error) {
        console.error('Error in getCustomDateReport:', error);
        res.status(500).render('admin/salesreport', {
            page: 'customDate',
            reportData: [],
            TotalAmount: 0,
            TotalDiscountAmount: 0,
            TotalSaleCount: 0,
            error: 'An error occurred while fetching the custom date report.',
            fromDate: req.body.fromDate,
            toDate: req.body.toDate
        });
    }
};

// Check Data Existence for Custom Date
exports.checkDataExist = async (req, res) => {
    try {
        const { fromDate, toDate } = req.query;

        if (!fromDate || !toDate) {
            return res.json({ success: false, message: 'Please provide both start and end dates.' });
        }

        const startDate = moment(fromDate).startOf('day').toDate();
        const endDate = moment(toDate).endOf('day').toDate();

        if (endDate < startDate) {
            return res.json({ success: false, message: 'End date cannot be earlier than start date.' });
        }

        const orders = await Order.find({
            createdAt: {
                $gte: startDate,
                $lte: endDate
            }
        }).limit(1);

        if (orders.length === 0) {
            return res.json({ success: false, message: 'No orders found for the selected date range.' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error in checkDataExist:', error);
        res.json({ success: false, message: 'An error occurred while checking data availability.' });
    }
};

// Generate PDF Report
exports.generatePDF = (req, res, orders, summary, page, fromDate = null, toDate = null) => {
    try {
        const doc = new PDFDocument({ margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${page}_sales_report.pdf`);

        doc.pipe(res);

        // Branding and Header
        doc.fontSize(20).text('Sales Report', { align: 'center' });
        doc.fontSize(12).text(`Generated on: ${moment().format('MMMM Do YYYY, h:mm:ss a')}`, { align: 'center' });
        if (page === 'customDate') {
            doc.text(`Period: ${formatDate(fromDate)} to ${formatDate(toDate)}`, { align: 'center' });
        } else {
            doc.text(`Period: ${page.charAt(0).toUpperCase() + page.slice(1)}`, { align: 'center' });
        }
        doc.moveDown();

        // Summary Section
        doc.fontSize(14).text('Summary', { underline: true });
        doc.fontSize(12)
            .text(`Total Orders: ${summary.TotalSaleCount}`)
            .text(`Total Revenue: $${summary.TotalAmount.toFixed(2)}`)
            .text(`Total Discount: $${summary.TotalDiscountAmount.toFixed(2)}`)
            .text(`Net Revenue: $${(summary.TotalAmount - summary.TotalDiscountAmount).toFixed(2)}`);
        doc.moveDown();

        // Detailed Orders
        doc.fontSize(14).text('Order Details', { underline: true });
        orders.forEach((order, index) => {
            doc.fontSize(12)
                .text(`Order ${index + 1}`)
                .text(`Order ID: ${order.orderNumber}`) // Use orderNumber from schema
                .text(`Customer: ${order.userId?.name || 'N/A'} (${order.userId?.email || 'N/A'})`)
                .text(`Date: ${formatDate(order.createdAt)}`)
                .text(`Payment Method: ${order.paymentMethod}`)
                .text(`Coupon Discount: $${(order.couponDiscount || 0).toFixed(2)}`)
                .text(`Total Before Discount: $${order.orderAmount.toFixed(2)}`) // Use orderAmount
                .text(`Total After Discount: $${order.finalAmount.toFixed(2)}`) // Use finalAmount
                .text(`Status: ${order.orderStatus}`)
                .moveDown();
        });

        doc.end();
    } catch (error) {
        console.error('Error in generatePDF:', error);
        res.status(500).send('Failed to generate PDF report.');
    }
};

// Generate Excel Report
exports.generateExcel = async (req, res, reportData, summary, page, fromDate = null, toDate = null) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Sales Report');

        // Define columns based on report type
        let columns = [];
        if (page === 'daily' || page === 'customDate') {
            columns = [
                { header: 'SI No', key: 'siNo', width: 10 },
                { header: 'Date', key: 'dateFormatted', width: 15 },
                { header: 'Total Orders', key: 'totalOrderCount', width: 15 },
                { header: 'Product Count', key: 'totalProducts', width: 15 },
                { header: 'Total Discount', key: 'totalDiscount', width: 15 },
                { header: 'Total Revenue', key: 'totalSales', width: 15 }
            ];
        } else if (page === 'weekly') {
            columns = [
                { header: 'SI No', key: 'siNo', width: 10 },
                { header: 'Start Date', key: 'startOfWeek', width: 15 },
                { header: 'End Date', key: 'endOfWeek', width: 15 },
                { header: 'Total Orders', key: 'totalOrderCount', width: 15 },
                { header: 'Product Count', key: 'totalProducts', width: 15 },
                { header: 'Total Discount', key: 'totalDiscount', width: 15 },
                { header: 'Total Revenue', key: 'totalSales', width: 15 }
            ];
        } else if (page === 'monthly') {
            columns = [
                { header: 'SI No', key: 'siNo', width: 10 },
                { header: 'Month-Year', key: 'monthYear', width: 15 },
                { header: 'Total Orders', key: 'totalOrderCount', width: 15 },
                { header: 'Product Count', key: 'totalProducts', width: 15 },
                { header: 'Total Discount', key: 'totalDiscount', width: 15 },
                { header: 'Total Revenue', key: 'totalSales', width: 15 }
            ];
        } else if (page === 'yearly') {
            columns = [
                { header: 'SI No', key: 'siNo', width: 10 },
                { header: 'Year', key: 'year', width: 15 },
                { header: 'Total Orders', key: 'totalOrderCount', width: 15 },
                { header: 'Product Count', key: 'totalProducts', width: 15 },
                { header: 'Total Discount', key: 'totalDiscount', width: 15 },
                { header: 'Total Revenue', key: 'totalSales', width: 15 }
            ];
        }

        worksheet.columns = columns;

        // Add summary
        worksheet.addRow(['Summary']);
        worksheet.addRow(['Total Orders', summary.TotalSaleCount]);
        worksheet.addRow(['Total Revenue', `$${summary.TotalAmount.toFixed(2)}`]);
        worksheet.addRow(['Total Discount', `$${summary.TotalDiscountAmount.toFixed(2)}`]);
        worksheet.addRow(['Net Revenue', `$${(summary.TotalAmount - summary.TotalDiscountAmount).toFixed(2)}`]);
        worksheet.addRow([]);

        // Add report data
        reportData.forEach((data, index) => {
            const row = { ...data, siNo: index + 1 };
            if (row.totalDiscount) row.totalDiscount = `$${row.totalDiscount.toFixed(2)}`;
            if (row.totalSales) row.totalSales = `$${row.totalSales.toFixed(2)}`;
            worksheet.addRow(row);
        });

        // Styling
        worksheet.getRow(1).font = { bold: true, size: 14 };
        worksheet.getRow(7).font = { bold: true };
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber <= 5) {
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

        // Write to response
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error in generateExcel:', error);
        res.status(500).send('Failed to generate Excel report.');
    }
};