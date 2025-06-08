const User = require('../../models/userSchema');
const Orders = require('../../models/orderSchema');
const Product = require('../../models/productSchema')
const bcrypt = require('bcrypt');

// Render the login page
exports.getLogin = (req, res) => {
    console.log("Session details>>>>", req.session)
    console.log('Flash messages on getLogin:', {
        error_msg: req.flash('error_msg'),
        success_msg: req.flash('success_msg'),
    });
    res.render('admin/login', {
        error_msg: req.flash('error_msg')[0] || '',
        success_msg: req.flash('success_msg')[0] || '',
    });
};

// Handle login form submission
exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if email and password are provided
    if (!email || !password) {
      req.flash('error_msg', 'Please provide both email and password');
      console.log('Flash set: Please provide both email and password');
      return res.redirect('/admin/login');
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user || !user.isAdmin) {
      req.flash('error_msg', 'Invalid credentials or not an admin');
      console.log('Flash set: Invalid credentials or not an admin');
      return res.redirect('/admin/login');
    }

    // Check if user is blocked
    if (user.isBlocked) {
      req.flash('error_msg', 'Your account is blocked');
      console.log('Flash set: Your account is blocked');
      return res.redirect('/admin/login');
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      req.flash('error_msg', 'Invalid password');
      console.log('Flash set: Invalid password');
      return res.redirect('/admin/login');
    }

    // Store admin data in session and clear user data
    req.session.admin = {
      id: user._id,
      email: user.email,
      name: user.name,
      isAuth: true
    };
    delete req.session.user;

    // Save session before redirecting
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        req.flash('error_msg', 'Failed to save session');
        return res.redirect('/admin/login');
      }
      req.flash('success_msg', 'Successfully logged in');
      console.log('Flash set: Successfully logged in');
      res.redirect('/admin/index');
    });
  } catch (error) {
    console.error('Admin login error:', error);
    if (!res.headersSent) {
      req.flash('error_msg', 'An error occurred during login');
      console.log('Flash set: An error occurred during login');
      res.redirect('/admin/login');
    }
  }
};

// Render the dashboard
exports.getDashboard = async (req, res) => {
    try {
        const currentDate = new Date();
        const filter = req.query.filter || 'monthly';

        // Set start date based on filter
        let startDate;
        switch (filter) {
            case 'daily':
                startDate = new Date(currentDate.setHours(0, 0, 0, 0));
                break;
            case 'weekly':
                startDate = new Date(currentDate.setDate(currentDate.getDate() - 7));
                break;
            case 'monthly':
                startDate = new Date(currentDate.setFullYear(currentDate.getFullYear(), currentDate.getMonth() - 1, currentDate.getDate()));
                break;
            case 'yearly':
                startDate = new Date(currentDate.setFullYear(currentDate.getFullYear() - 1));
                break;
            default:
                startDate = new Date(currentDate.setMonth(currentDate.getMonth() - 1));
        }

        // Total Revenue
        const totalRevenue = await Orders.aggregate([
            { $match: { createdAt: { $gte: startDate }, orderStatus: 'Delivered' } },
            { $group: { _id: null, total: { $sum: '$finalAmount' } } }
        ]);

        // Total Orders
        const totalOrders = await Orders.countDocuments({
            createdAt: { $gte: startDate },
            orderStatus: 'Delivered'
        });

        // Total Products
        const totalProducts = await Product.countDocuments({ status: true });

        // Monthly Earning
        const monthlyEarning = await Orders.aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
                    },
                    orderStatus: 'Delivered'
                }
            },
            { $group: { _id: null, total: { $sum: '$finalAmount' } } }
        ]);

        // Sales Data for Chart
        const salesData = await Orders.aggregate([
            { $match: { createdAt: { $gte: startDate }, orderStatus: 'Delivered' } },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: filter === 'yearly' ? '%Y-%m' : '%Y-%m-%d',
                            date: '$createdAt'
                        }
                    },
                    total: { $sum: '$finalAmount' }
                }
            },
            { $sort: { '_id': 1 } }
        ]);

        // Top 10 Best Selling Products
        const bestSellingProducts = await Orders.aggregate([
            { $match: { createdAt: { $gte: startDate }, orderStatus: 'Delivered' } },
            { $unwind: '$orderedItem' },
            {
                $group: {
                    _id: '$orderedItem.productId',
                    totalSold: { $sum: '$orderedItem.quantity' },
                    totalRevenue: { $sum: '$orderedItem.finalTotalProductPrice' }
                }
            },
            {
                $lookup: {
                    from: 'products',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            { $unwind: '$product' },
            { $sort: { totalSold: -1 } },
            { $limit: 10 }
        ]);

        // Top 10 Best Selling Categories
        const bestSellingCategories = await Orders.aggregate([
            { $match: { createdAt: { $gte: startDate }, orderStatus: 'Delivered' } },
            { $unwind: '$orderedItem' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'orderedItem.productId',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            { $unwind: '$product' },
            {
                $group: {
                    _id: '$product.category',
                    totalSold: { $sum: '$orderedItem.quantity' },
                    totalRevenue: { $sum: '$orderedItem.finalTotalProductPrice' }
                }
            },
            {
                $lookup: {
                    from: 'categories',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'category'
                }
            },
            { $unwind: '$category' },
            { $sort: { totalSold: -1 } },
            { $limit: 10 }
        ]);

        // Latest Orders
        const latestOrders = await Orders.find({
            orderStatus: { $ne: 'Cancelled' }
        })
            .sort({ createdAt: -1 })
            .limit(10)
            .populate('userId', 'name')
            .populate('deliveryAddress');

        // Sales Report URL
        const salesReportUrl = '/admin/salesreport';

        // Render the dashboard
        res.render('admin/index', {
            revenue: totalRevenue[0]?.total || 0,
            orders: totalOrders,
            products: totalProducts,
            monthlyEarning: monthlyEarning[0]?.total || 0,
            salesData,
            bestSellingProducts,
            bestSellingCategories,
            latestOrders,
            filter,
            currentDate: new Date(),
            salesReportUrl,
            error_msg: req.flash('error'),
            success_msg: req.flash('success')
        });
    } catch (error) {
        console.error('Admin Dashboard Error:', error);
        res.status(500).render('admin/index', {
            revenue: 0,
            orders: 0,
            products: 0,
            monthlyEarning: 0,
            salesData: [],
            bestSellingProducts: [],
            bestSellingCategories: [],
            latestOrders: [],
            filter: 'monthly',
            currentDate: new Date(),
            salesReportUrl: '/admin/salesreport',
            error_msg: 'Failed to load dashboard data. Please try again.',
            success_msg: ''
        });
    }
};

exports.getSalesData = async (req, res) => {
    try {
        const filter = req.query.filter || 'yearly';
        let groupBy, sortBy;

        switch (filter) {
            case 'yearly':
                groupBy = {
                    year: { $year: '$createdAt' }
                };
                sortBy = { '_id.year': 1 };
                break;
            case 'monthly':
                groupBy = {
                    year: { $year: '$createdAt' },
                    month: { $month: '$createdAt' }
                };
                sortBy = { '_id.year': 1, '_id.month': 1 };
                break;
            case 'weekly':
                groupBy = {
                    year: { $year: '$createdAt' },
                    week: { $week: '$createdAt' }
                };
                sortBy = { '_id.year': 1, '_id.week': 1 };
                break;
            default:
                return res.status(400).json({ error: 'Invalid filter' });
        }

        const salesData = await Orders.aggregate([
            {
                $match: { 
                    paymentStatus: 'Paid',
                    orderStatus: { $nin: ['Cancelled', 'Returned'] }
                }
            },
            {
                $group: {
                    _id: groupBy,
                    totalSales: { $sum: '$finalAmount' },
                    orderCount: { $sum: 1 }
                }
            },
            {
                $sort: sortBy
            },
            {
                $project: {
                    year: '$_id.year',
                    month: '$_id.month',
                    week: '$_id.week',
                    totalSales: 1,
                    orderCount: 1,
                    _id: 0
                }
            }
        ]);

        res.json(salesData);
    } catch (error) {
        console.error('Error fetching sales data:', error);
        res.status(500).json({ error: 'Server Error' });
    }
};