const jwt = require('jsonwebtoken');
const User = require('../models/userSchema');

const verifyToken = async (req, res, next) => {
    const token = req.cookies.token;

    if (!token) {
        req.session.error_msg = 'No authentication token provided. Please log in.';
        return res.redirect('/login');
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).lean();
        if (!user) {
            req.session.error_msg = 'User not found. Please log in again.';
            return res.redirect('/login');
        }
        req.user = { id: user._id, isAdmin: user.isAdmin };
        next();
    } catch (err) {
        console.error('JWT verification error:', err);
        req.session.error_msg = 'Invalid or expired token. Please log in again.';
        return res.redirect('/login');
    }
};

module.exports = { verifyToken };