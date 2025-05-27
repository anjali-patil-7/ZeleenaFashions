const mongoose = require("mongoose");
const Order = require("../../models/orderSchema");
const User = require("../../models/userSchema");
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");
const moment = require("moment");

// Helper function to format dates
const formatDate = (date, format = "DD-MM-YYYY") => moment(date).format(format);

// Helper function to calculate summary
const calculateSummary = async (query) => {
  const orders = await Order.find(query).lean();
  return {
    TotalAmount: orders.reduce(
      (sum, order) => sum + (order.finalAmount || 0),
      0
    ),
    TotalDiscountAmount: orders.reduce(
      (sum, order) => sum + (order.couponDiscount || 0),
      0
    ),
    TotalSaleCount: orders.length,
  };
};

// Render Sales Report
exports.getSalesReport = async (req, res) => {
  try {
    const { period } = req.params;
    const { format, page: currentPage = 1 } = req.query;
    const perPage = 10;
    const validPeriods = ["daily", "weekly", "monthly", "yearly"];
    let query = {};

    // Validate period parameter
    if (!validPeriods.includes(period)) {
      console.log(`Invalid period: ${period}`);
      return res.status(400).render("admin/salesreport", {
        page: "daily",
        orders: [],
        TotalAmount: 0,
        TotalDiscountAmount: 0,
        TotalSaleCount: 0,
        error: `Invalid period: ${period}. Valid options are ${validPeriods.join(
          ", "
        )}.`,
        fromDate: null,
        toDate: null,
        currentPage: 1,
        totalPages: 0,
        perPage,
      });
    }

    console.log(
      `Processing sales report for period: ${period}, page: ${currentPage}`
    );

    // Date range filtering
    if (period === "daily") {
      query.createdAt = {
        $gte: moment().startOf("day").toDate(),
        $lte: moment().endOf("day").toDate(),
      };
    } else if (period === "weekly") {
      query.createdAt = {
        $gte: moment().startOf("week").toDate(),
        $lte: moment().endOf("week").toDate(),
      };
    } else if (period === "monthly") {
      query.createdAt = {
        $gte: moment().startOf("month").toDate(),
        $lte: moment().endOf("month").toDate(),
      };
    } else if (period === "yearly") {
      query.createdAt = {
        $gte: moment().startOf("year").toDate(),
        $lte: moment().endOf("year").toDate(),
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

    // Fetch paginated orders for view
    let orders = await Order.find(query)
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .skip((parseInt(currentPage) - 1) * perPage)
      .limit(perPage)
      .lean();

    // Add formatted orderDate and orderStatus
    orders = orders.map((order) => ({
      ...order,
      orderDate: formatDate(order.createdAt),
      orderStatus: order.orderStatus || "N/A",
    }));

    // For PDF/Excel, fetch all orders
    let allOrders = [];
    if (format === "pdf" || format === "excel") {
      allOrders = await Order.find(query)
        .populate("userId", "name email")
        .sort({ createdAt: -1 })
        .lean()
        .then((orders) =>
          orders.map((order) => ({
            ...order,
            orderDate: formatDate(order.createdAt),
            orderStatus: order.orderStatus || "N/A",
          }))
        );
      console.log(`Fetched ${allOrders.length} orders for ${format} report`);
    }

    if (format === "pdf") {
      return exports.generatePDF(req, res, allOrders, summary, period);
    } else if (format === "excel") {
      return exports.generateExcel(req, res, allOrders, summary, period);
    }

    res.render("admin/salesreport", {
      page: period,
      orders,
      TotalAmount: summary.TotalAmount,
      TotalDiscountAmount: summary.TotalDiscountAmount,
      TotalSaleCount: summary.TotalSaleCount,
      error:
        orders.length === 0 ? "No orders found for the selected period." : null,
      fromDate: null,
      toDate: null,
      currentPage: parseInt(currentPage),
      totalPages,
      perPage,
    });
  } catch (error) {
    console.error("Error in getSalesReport:", error);
    res.status(500).render("admin/salesreport", {
      page: req.params.period || "daily",
      orders: [],
      TotalAmount: 0,
      TotalDiscountAmount: 0,
      TotalSaleCount: 0,
      error: `Error fetching sales report: ${error.message}`,
      fromDate: null,
      toDate: null,
      currentPage: 1,
      totalPages: 0,
      perPage: 10,
    });
  }
};

// Custom Date Sales Report
exports.getCustomDateReport = async (req, res) => {
  try {
    const { fromDate, toDate, format, page: currentPage = 1 } = req.query;
    const perPage = 10;

    console.log(
      `Custom date report requested: fromDate=${fromDate}, toDate=${toDate}, page=${currentPage}`
    );

    if (!fromDate || !toDate) {
      console.log("Missing fromDate or toDate");
      return res.status(400).render("admin/salesreport", {
        page: "customDate",
        orders: [],
        TotalAmount: 0,
        TotalDiscountAmount: 0,
        TotalSaleCount: 0,
        error: "Please provide both start and end dates.",
        fromDate,
        toDate,
        currentPage: 1,
        totalPages: 0,
        perPage,
      });
    }

    const startDate = moment(fromDate).startOf("day").toDate();
    const endDate = moment(toDate).endOf("day").toDate();

    if (endDate < startDate) {
      console.log("End date is earlier than start date");
      return res.status(400).render("admin/salesreport", {
        page: "customDate",
        orders: [],
        TotalAmount: 0,
        TotalDiscountAmount: 0,
        TotalSaleCount: 0,
        error: "End date cannot be earlier than start date.",
        fromDate,
        toDate,
        currentPage: 1,
        totalPages: 0,
        perPage,
      });
    }

    // Fetch total orders for pagination
    const query = { createdAt: { $gte: startDate, $lte: endDate } };
    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / perPage);
    console.log(
      `Custom date - Total orders: ${totalOrders}, Total pages: ${totalPages}`
    );

    // Calculate summary for all orders in the period
    const summary = await calculateSummary(query);
    console.log(`Custom date - Summary: ${JSON.stringify(summary)}`);

    // Fetch paginated orders for view
    let orders = await Order.find(query)
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .skip((parseInt(currentPage) - 1) * perPage)
      .limit(perPage)
      .lean();

    // Add formatted orderDate and orderStatus
    orders = orders.map((order) => ({
      ...order,
      orderDate: formatDate(order.createdAt),
      orderStatus: order.orderStatus || "N/A",
    }));

    // For PDF/Excel, fetch all orders
    let allOrders = [];
    if (format === "pdf" || format === "excel") {
      allOrders = await Order.find(query)
        .populate("userId", "name email")
        .sort({ createdAt: -1 })
        .lean()
        .then((orders) =>
          orders.map((order) => ({
            ...order,
            orderDate: formatDate(order.createdAt),
            orderStatus: order.orderStatus || "N/A",
          }))
        );
      console.log(`Fetched ${allOrders.length} orders for ${format} report`);
    }

    if (format === "pdf") {
      return exports.generatePDF(
        req,
        res,
        allOrders,
        summary,
        "customDate",
        fromDate,
        toDate
      );
    } else if (format === "excel") {
      return exports.generateExcel(
        req,
        res,
        allOrders,
        summary,
        "customDate",
        fromDate,
        toDate
      );
    }

    res.render("admin/salesreport", {
      page: "customDate",
      orders,
      TotalAmount: summary.TotalAmount,
      TotalDiscountAmount: summary.TotalDiscountAmount,
      TotalSaleCount: summary.TotalSaleCount,
      error:
        orders.length === 0
          ? "No orders found for the selected date range."
          : null,
      fromDate,
      toDate,
      currentPage: parseInt(currentPage),
      totalPages,
      perPage,
    });
  } catch (error) {
    console.error("Error in getCustomDateReport:", error);
    res.status(500).render("admin/salesreport", {
      page: "customDate",
      orders: [],
      TotalAmount: 0,
      TotalDiscountAmount: 0,
      TotalSaleCount: 0,
      error: `Error fetching custom date report: ${error.message}`,
      fromDate: req.query.fromDate || "",
      toDate: req.query.toDate || "",
      currentPage: 1,
      totalPages: 0,
      perPage: 10,
    });
  }
};

// Check Data Existence for Custom Date
exports.checkDataExist = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;

    console.log(
      `Checking data existence: fromDate=${fromDate}, toDate=${toDate}`
    );

    if (!fromDate || !toDate) {
      return res.json({
        success: false,
        message: "Please provide both start and end dates.",
      });
    }

    const startDate = moment(fromDate).startOf("day").toDate();
    const endDate = moment(toDate).endOf("day").toDate();

    if (endDate < startDate) {
      return res.json({
        success: false,
        message: "End date cannot be earlier than start date.",
      });
    }

    const orders = await Order.find({
      createdAt: { $gte: startDate, $lte: endDate },
    }).limit(1);

    console.log(`Data existence check: ${orders.length} orders found`);

    if (orders.length === 0) {
      return res.json({
        success: false,
        message: "No orders found for the selected date range.",
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error in checkDataExist:", error);
    res.json({
      success: false,
      message: `Error checking data availability: ${error.message}`,
    });
  }
};

exports.generatePDF = (req, res, orders, summary, period, fromDate = null, toDate = null) => {
    try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const filename = `Sales_Report_${period}_${Date.now()}.pdf`;

        res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-type', 'application/pdf');

        doc.pipe(res);
        doc.font('Helvetica');

        const drawFullHeader = () => {
            doc.fontSize(20).font('Helvetica-Bold').text('Zeleena Fashions', 50, 50, { align: 'center' });
            doc.fontSize(10).font('Helvetica')
                .text('Phone: +91 98765 43210', 50, 80, { align: 'center' })
                .text('Email: support@zeleenafashions.com', 50, 95, { align: 'center' });
            doc.fontSize(16).font('Helvetica-Bold')
                .text('Sales Report', 50, 120, { align: 'center' });
            doc.fontSize(12).font('Helvetica')
                .text(`Period: ${period.charAt(0).toUpperCase() + period.slice(1)}`, 50, 150);
            if (fromDate && toDate) {
                doc.text(`From: ${formatDate(fromDate)} To: ${formatDate(toDate)}`, 50, 165);
            }
            doc.font('Helvetica-Bold').text('Summary', 50, 190, { underline: true });
            doc.font('Helvetica')
                .text(`Total Sales: ${summary.TotalSaleCount}`, 50, 210)
                .text(`Total Amount: ₹${summary.TotalAmount.toFixed(2)}`, 50, 225)
                .text(`Total Discount: ₹${summary.TotalDiscountAmount.toFixed(2)}`, 50, 240);
        };

        const drawMinimalHeader = () => {
            doc.fontSize(12).font('Helvetica-Bold')
                .text('Sales Report', 50, 50, { align: 'center' });
            doc.fontSize(10).font('Helvetica')
                .text(`Period: ${period.charAt(0).toUpperCase() + period.slice(1)}`, 50, 70);
            if (fromDate && toDate) {
                doc.text(`From: ${formatDate(fromDate)} To: ${formatDate(toDate)}`, 50, 85);
            }
        };

        const drawTableHeader = (y) => {
            const col = { orderId: 90, customer: 150, date: 100, amount: 90, discount: 90 };
            const left = 50;

            doc.moveTo(left, y).lineTo(left + 520, y).stroke();
            doc.font('Helvetica-Bold').fontSize(10);
            doc.text('Order ID', left + 5, y + 5, { width: col.orderId - 10 });
            doc.text('Customer', left + col.orderId + 5, y + 5, { width: col.customer - 10 });
            doc.text('Date', left + col.orderId + col.customer + 5, y + 5, { width: col.date - 10 });
            doc.text('Amount', left + col.orderId + col.customer + col.date + 5, y + 5, { width: col.amount - 10 });
            doc.text('Discount', left + col.orderId + col.customer + col.date + col.amount + 5, y + 5, { width: col.discount - 10 });
            doc.moveTo(left, y + 20).lineTo(left + 520, y + 20).stroke();

            let x = left;
            [0, col.orderId, col.customer, col.date, col.amount, col.discount].forEach(w => {
                doc.moveTo(x, y).lineTo(x, y + 20).stroke();
                x += w;
            });

            return y + 25;
        };

        const drawTableRow = (order, y) => {
            const col = { orderId: 90, customer: 150, date: 100, amount: 90, discount: 90 };
            const left = 50;
            const orderIdStr = order._id.toString().slice(-6);
            const customerName = order.userId ? order.userId.name.substring(0, 20) : 'N/A';

            doc.font('Helvetica').fontSize(9);
            doc.text(orderIdStr, left + 5, y + 5, { width: col.orderId - 10 });
            doc.text(customerName, left + col.orderId + 5, y + 5, { width: col.customer - 10 });
            doc.text(order.orderDate, left + col.orderId + col.customer + 5, y + 5, { width: col.date - 10 });
            doc.text(`₹${order.finalAmount.toFixed(2)}`, left + col.orderId + col.customer + col.date + 5, y + 5, { width: col.amount - 10 });
            doc.text(`₹${order.couponDiscount ? order.couponDiscount.toFixed(2) : '0.00'}`, left + col.orderId + col.customer + col.date + col.amount + 5, y + 5, { width: col.discount - 10 });

            doc.moveTo(left, y + 20).lineTo(left + 520, y + 20).stroke();
            let x = left;
            [0, col.orderId, col.customer, col.date, col.amount, col.discount].forEach(w => {
                doc.moveTo(x, y).lineTo(x, y + 20).stroke();
                x += w;
            });

            return y + 20;
        };

        drawFullHeader();
        let tableY = 270;
        let currentPage = 1;
        tableY = drawTableHeader(tableY);

        orders.forEach((order, idx) => {
            if (tableY + 30 > doc.page.height - 70) {
                doc.fontSize(8).text(`Page ${currentPage}`, 50, doc.page.height - 50, { align: 'center' });
                doc.addPage();
                currentPage++;
                drawMinimalHeader();
                tableY = 110;
                tableY = drawTableHeader(tableY);
            }
            tableY = drawTableRow(order, tableY);
        });

        doc.fontSize(8).text(`Page ${currentPage}`, 50, doc.page.height - 50, { align: 'center' });

        doc.end();
    } catch (error) {
        console.error('Error in generatePDF:', error);
        res.status(500).send('Error generating PDF report');
    }
};


