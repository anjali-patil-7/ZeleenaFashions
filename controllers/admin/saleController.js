const mongoose = require("mongoose");
const Order = require("../../models/orderSchema");
const User = require("../../models/userSchema");
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");
const moment = require("moment-timezone");

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
    let query = { orderStatus: "Delivered" };

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
      orderStatus: "Delivered",
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
            orderStatus: "Delivered",
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
  console.log("Custom date filter initialized...");
  try {
    const { from, to, format, page: currentPage = 1 } = req.query;
    const perPage = 10;

    console.log(
      `Custom date report requested: from=${from}, to=${to}, page=${currentPage}, format=${format}`
    );

    if (!from || !to) {
      console.log("Missing from or to in query parameters");
      return res.status(400).render("admin/salesreport", {
        page: "custom",
        orders: [],
        TotalAmount: 0,
        TotalDiscountAmount: 0,
        TotalSaleCount: 0,
        error: "Please provide both start and end dates.",
        fromDate: from,
        toDate: to,
        currentPage: 1,
        totalPages: 0,
        perPage,
      });
    }

    const startDate = moment
      .tz(from, "YYYY-MM-DD", "Asia/Kolkata")
      .startOf("day");
    const endDate = moment.tz(to, "YYYY-MM-DD", "Asia/Kolkata").endOf("day");
    const today = moment.tz("Asia/Kolkata").endOf("day");

    console.log("startDate:", startDate.format());
    console.log("endDate:", endDate.format());
    console.log("today:", today.format());

    if (!startDate.isValid() || !endDate.isValid()) {
      console.log("Invalid date format for from or to");
      return res.status(400).render("admin/salesreport", {
        page: "custom",
        orders: [],
        TotalAmount: 0,
        TotalDiscountAmount: 0,
        TotalSaleCount: 0,
        error: "Invalid date format. Use YYYY-MM-DD.",
        fromDate: from,
        toDate: to,
        currentPage: 1,
        totalPages: 0,
        perPage,
      });
    }

    if (endDate.isBefore(startDate)) {
      console.log("End date is earlier than start date");
      return res.status(400).render("admin/salesreport", {
        page: "custom",
        orders: [],
        TotalAmount: 0,
        TotalDiscountAmount: 0,
        TotalSaleCount: 0,
        error: "End date cannot be earlier than start date.",
        fromDate: from,
        toDate: to,
        currentPage: 1,
        totalPages: 0,
        perPage,
      });
    }

    if (startDate.isAfter(today) || endDate.isAfter(today)) {
      console.log("Dates are in the future");
      return res.status(400).render("admin/salesreport", {
        page: "custom",
        orders: [],
        TotalAmount: 0,
        TotalDiscountAmount: 0,
        TotalSaleCount: 0,
        error: "Dates cannot be in the future.",
        fromDate: from,
        toDate: to,
        currentPage: 1,
        totalPages: 0,
        perPage,
      });
    }

    const query = {
      createdAt: {
        $gte: startDate.toDate(),
        $lte: endDate.toDate(),
      },
      orderStatus: "Delivered",
    };

    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / perPage);
    console.log(
      `Custom date - Total orders: ${totalOrders}, Total pages: ${totalPages}`
    );

    const summary = await calculateSummary(query);
    console.log(`Custom date - Summary: ${JSON.stringify(summary)}`);

    let orders = await Order.find(query)
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .skip((parseInt(currentPage) - 1) * perPage)
      .limit(perPage)
      .lean();

    orders = orders.map((order) => ({
      ...order,
      orderDate: formatDate(order.createdAt),
      orderStatus: "Delivered",
    }));

    // Handle report downloads
    if (format === "pdf" || format === "excel") {
      const allOrders = await Order.find(query)
        .populate("userId", "name email")
        .sort({ createdAt: -1 })
        .lean()
        .then((orders) =>
          orders.map((order) => ({
            ...order,
            orderDate: formatDate(order.createdAt),
            orderStatus: "Delivered",
          }))
        );

      if (format === "pdf") {
        return exports.generatePDF(
          req,
          res,
          allOrders,
          summary,
          "custom",
          from,
          to
        );
      } else if (format === "excel") {
        return exports.generateExcel(
          req,
          res,
          allOrders,
          summary,
          "custom",
          from,
          to
        );
      }
    }

    // Render the sales report page by default
    res.render("admin/salesreport", {
      page: "custom",
      orders,
      TotalAmount: summary.TotalAmount,
      TotalDiscountAmount: summary.TotalDiscountAmount,
      TotalSaleCount: summary.TotalSaleCount,
      error:
        orders.length === 0
          ? "No orders found for the selected date range."
          : null,
      fromDate: from,
      toDate: to,
      currentPage: parseInt(currentPage),
      totalPages,
      perPage,
    });
  } catch (error) {
    console.error("Error in getCustomDateReport:", error);
    res.status(500).render("admin/salesreport", {
      page: "custom",
      orders: [],
      TotalAmount: 0,
      TotalDiscountAmount: 0,
      TotalSaleCount: 0,
      error: `Error fetching custom date report: ${error.message}`,
      fromDate: req.query.from || "",
      toDate: req.query.to || "",
      currentPage: 1,
      totalPages: 0,
      perPage: 10,
    });
  }
};

// Check Data Existence for Custom Date
exports.checkDataExist = async (req, res) => {
  try {
    const { from, to } = req.query;

    console.log(`Checking data existence: from=${from}, to=${to}`);

    if (!from || !to) {
      return res.json({
        success: false,
        message: "Please provide both start and end dates.",
      });
    }

    const startDate = moment(from, "YYYY-MM-DD").startOf("day").toDate();
    const endDate = moment(to, "YYYY-MM-DD").endOf("day").toDate();

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.json({
        success: false,
        message: "Invalid date format. Use YYYY-MM-DD.",
      });
    }

    if (endDate < startDate) {
      return res.json({
        success: false,
        message: "End date cannot be earlier than start date.",
      });
    }

    const orders = await Order.find({
      createdAt: { $gte: startDate, $lte: endDate },
      orderStatus: "Delivered",
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

// Generate PDF
exports.generatePDF = (
  req,
  res,
  orders,
  summary,
  period,
  fromDate = null,
  toDate = null
) => {
  try {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const filename = `Sales_Report_${period}_${Date.now()}.pdf`;

    res.setHeader("Content-disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-type", "application/pdf");

    doc.pipe(res);
    doc.font("Helvetica");

    const drawFullHeader = () => {
      doc
        .fontSize(20)
        .font("Helvetica-Bold")
        .text("Zeleena Fashions", 50, 50, { align: "center" });
      doc
        .fontSize(10)
        .font("Helvetica")
        .text("Phone: +91 98765 43210", 50, 80, { align: "center" })
        .text("Email: support@zeleenafashions.com", 50, 95, {
          align: "center",
        });
      doc
        .fontSize(16)
        .font("Helvetica-Bold")
        .text("Sales Report", 50, 120, { align: "center" });
      doc
        .fontSize(12)
        .font("Helvetica")
        .text(
          `Period: ${period.charAt(0).toUpperCase() + period.slice(1)}`,
          50,
          150
        );
      if (fromDate && toDate) {
        doc.text(
          `From: ${formatDate(fromDate)} To: ${formatDate(toDate)}`,
          50,
          165
        );
      }
      doc.font("Helvetica-Bold").text("Summary", 50, 190, { underline: true });
      doc
        .font("Helvetica")
        .text(`Total Sales: ${summary.TotalSaleCount}`, 50, 210)
        .text(`Total Amount: ₹${summary.TotalAmount.toFixed(2)}`, 50, 225)
        .text(
          `Total Discount: ₹${summary.TotalDiscountAmount.toFixed(2)}`,
          50,
          240
        );
    };

    const drawMinimalHeader = () => {
      doc
        .fontSize(12)
        .font("Helvetica-Bold")
        .text("Sales Report", 50, 50, { align: "center" });
      doc
        .fontSize(10)
        .font("Helvetica")
        .text(
          `Period: ${period.charAt(0).toUpperCase() + period.slice(1)}`,
          50,
          70
        );
      if (fromDate && toDate) {
        doc.text(
          `From: ${formatDate(fromDate)} To: ${formatDate(toDate)}`,
          50,
          85
        );
      }
    };

    const drawTableHeader = (y) => {
      const col = {
        orderId: 90,
        customer: 150,
        date: 100,
        amount: 90,
        discount: 90,
      };
      const left = 50;

      doc
        .moveTo(left, y)
        .lineTo(left + 520, y)
        .stroke();
      doc.font("Helvetica-Bold").fontSize(10);
      doc.text("Order ID", left + 5, y + 5, { width: col.orderId - 10 });
      doc.text("Customer", left + col.orderId + 5, y + 5, {
        width: col.customer - 10,
      });
      doc.text("Date", left + col.orderId + col.customer + 5, y + 5, {
        width: col.date - 10,
      });
      doc.text(
        "Amount",
        left + col.orderId + col.customer + col.date + 5,
        y + 5,
        { width: col.amount - 10 }
      );
      doc.text(
        "Discount",
        left + col.orderId + col.customer + col.date + col.amount + 5,
        y + 5,
        { width: col.discount - 10 }
      );
      doc
        .moveTo(left, y + 20)
        .lineTo(left + 520, y + 20)
        .stroke();

      let x = left;
      [
        0,
        col.orderId,
        col.customer,
        col.date,
        col.amount,
        col.discount,
      ].forEach((w) => {
        doc
          .moveTo(x, y)
          .lineTo(x, y + 20)
          .stroke();
        x += w;
      });

      return y + 25;
    };

    const drawTableRow = (order, y) => {
      const col = {
        orderId: 90,
        customer: 150,
        date: 100,
        amount: 90,
        discount: 90,
      };
      const left = 50;
      const orderIdStr = order._id.toString().slice(-6);
      const customerName = order.userId
        ? order.userId.name.substring(0, 20)
        : "N/A";

      doc.font("Helvetica").fontSize(9);
      doc.text(orderIdStr, left + 5, y + 5, { width: col.orderId - 10 });
      doc.text(customerName, left + col.orderId + 5, y + 5, {
        width: col.customer - 10,
      });
      doc.text(order.orderDate, left + col.orderId + col.customer + 5, y + 5, {
        width: col.date - 10,
      });
      doc.text(
        `₹${order.finalAmount.toFixed(2)}`,
        left + col.orderId + col.customer + col.date + 5,
        y + 5,
        { width: col.amount - 10 }
      );
      doc.text(
        `₹${order.couponDiscount ? order.couponDiscount.toFixed(2) : "0.00"}`,
        left + col.orderId + col.customer + col.date + col.amount + 5,
        y + 5,
        { width: col.discount - 10 }
      );

      doc
        .moveTo(left, y + 20)
        .lineTo(left + 520, y + 20)
        .stroke();
      let x = left;
      [
        0,
        col.orderId,
        col.customer,
        col.date,
        col.amount,
        col.discount,
      ].forEach((w) => {
        doc
          .moveTo(x, y)
          .lineTo(x, y + 20)
          .stroke();
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
        doc.fontSize(8).text(`Page ${currentPage}`, 50, doc.page.height - 50, {
          align: "center",
        });
        doc.addPage();
        currentPage++;
        drawMinimalHeader();
        tableY = 110;
        tableY = drawTableHeader(tableY);
      }
      tableY = drawTableRow(order, tableY);
    });

    doc.fontSize(8).text(`Page ${currentPage}`, 50, doc.page.height - 50, {
      align: "center",
    });

    doc.end();
  } catch (error) {
    console.error("Error in generatePDF:", error);
    res.status(500).send("Error generating PDF report");
  }
};

// Download Sales Report (Excel)
exports.downloadSalesReport = async (req, res) => {
  try {
    const { filter, from, to, format } = req.query;

    if (format !== "xlsx") {
      return res
        .status(400)
        .json({ message: "Unsupported format. Use format=xlsx" });
    }

    // Date filter setup
    let startDate, endDate;
    switch (filter) {
      case "daily":
        startDate = moment().startOf("day").toDate();
        endDate = moment().endOf("day").toDate();
        break;
      case "weekly":
        startDate = moment().startOf("week").toDate();
        endDate = moment().endOf("week").toDate();
        break;
      case "monthly":
        startDate = moment().startOf("month").toDate();
        endDate = moment().endOf("month").toDate();
        break;
      case "yearly":
        startDate = moment().startOf("year").toDate();
        endDate = moment().endOf("year").toDate();
        break;
      case "custom":
        if (!from || !to) {
          return res.status(400).json({ message: "Missing custom date range" });
        }
        startDate = moment(from, "YYYY-MM-DD").startOf("day").toDate();
        endDate = moment(to, "YYYY-MM-DD").endOf("day").toDate();
        break;
      default:
        return res.status(400).json({ message: "Invalid filter type" });
    }

    // Fetch all orders in the range with Delivered status
    const orders = await Order.find({
      createdAt: { $gte: startDate, $lte: endDate },
      orderStatus: "Delivered",
    }).populate("userId");

    // Excel setup
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sales Report");

    worksheet.columns = [
      { header: "SI No", key: "sino", width: 10 },
      { header: "Order Date", key: "orderDate", width: 20 },
      { header: "Customer Name", key: "customerName", width: 25 },
      { header: "Order ID", key: "orderId", width: 30 },
      { header: "Order Amount (₹)", key: "orderAmount", width: 20 },
      { header: "Discount (₹)", key: "discount", width: 15 },
      { header: "Offer (₹)", key: "offer", width: 15 },
      { header: "Order Status", key: "status", width: 20 },
      { header: "Payment Status", key: "paymentStatus", width: 20 },
    ];

    let totalAmount = 0;
    let totalDiscount = 0;
    let totalOffer = 0;

    orders.forEach((order, index) => {
      const orderAmount = order.orderAmount || 0;
      const discount = order.couponDiscount || 0;
      const offer = order.offerDiscount || 0;

      worksheet.addRow({
        sino: index + 1,
        orderDate: moment(order.createdAt).format("YYYY-MM-DD"),
        customerName: order.userId?.name || "N/A",
        orderId: order.orderNumber || order._id.toString(),
        orderAmount,
        discount,
        offer,
        status: "Delivered",
        paymentStatus: order.paymentStatus || "N/A",
      });

      // Only count revenue for 'Paid' and 'Partially Refunded'
      if (["Paid", "Partially Refunded"].includes(order.paymentStatus)) {
        totalAmount += orderAmount;
        totalDiscount += discount;
        totalOffer += offer;
      }
    });

    // Add totals row
    worksheet.addRow({});
    worksheet.addRow({
      sino: "",
      orderDate: "",
      customerName: "",
      orderId: "Total Revenue",
      orderAmount: totalAmount,
      discount: totalDiscount,
      offer: totalOffer,
      status: "",
      paymentStatus: "",
    });

    // Format total row
    const totalRow = worksheet.lastRow;
    totalRow.font = { bold: true };
    totalRow.eachCell((cell) => {
      cell.border = {
        top: { style: "thin" },
        bottom: { style: "double" },
      };
    });

    // Response headers
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=sales_report_${filter}_${moment().format(
        "YYYYMMDD_HHmmss"
      )}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Excel download error:", error);
    res.status(500).json({ message: "Server error generating Excel report" });
  }
};
