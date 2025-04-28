const User = require('../../models/userSchema');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

// Render the login page
exports.getLogin = (req, res) => {
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

    // Check if user exists and is an admin
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

    // Set session for authenticated admin
    req.session.admin = {
      id: user._id,
      email: user.email,
      name: user.name,
    };

    req.flash('success_msg', 'Successfully logged in');
    console.log('Flash set: Successfully logged in');
    res.redirect('/admin/index');
  } catch (error) {
    console.error('Admin login error:', error);
    req.flash('error_msg', 'An error occurred during login');
    console.log('Flash set: An error occurred during login');
    res.redirect('/admin/login');
  }
};

// Render the dashboard
exports.getDashboard = async (req, res) => {
  try {
    // Ensure session exists
    if (!req.session || !req.session.admin) {
      req.flash('error_msg', 'Session expired. Please log in again.');
      console.log('Flash set: Session expired. Please log in again.');
      return res.redirect('/admin/login');
    }

    // Fetch admin data
    const admin = await User.findById(req.session.admin.id).select('name email');
    if (!admin) {
      req.flash('error_msg', 'Admin account not found');
      console.log('Flash set: Admin account not found');
      return res.redirect('/admin/login');
    }

    // Get filter from query parameter, default to 'daily'
    const filter = req.query.filter || 'daily';

    // Render dashboard with filter and flash messages
    res.render('admin/index', {
      admin: {
        name: admin.name,
        email: admin.email,
      },
      error_msg: req.flash('error_msg')[0] || '',
      success_msg: req.flash('success_msg')[0] || '',
      filter, // Pass filter to the view
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    req.flash('error_msg', 'Error loading dashboard');
    console.log('Flash set: Error loading dashboard');
    res.redirect('/admin/login');
  }
};