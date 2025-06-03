const jwt = require('jsonwebtoken');


const verifyToken = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
        req.flash('error_msg', 'Please log in to access this page.');
        return res.redirect('/login');
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = { id: decoded.id }; // Ensure req.user.id is set
        next();
    } catch (err) {
        console.error('Token verification error:', err);
        req.flash('error_msg', 'Invalid or expired token.');
        res.clearCookie('token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
        });
        return res.redirect('/login');
    }
};

const ifLogged = (req, res, next) => {
    const token = req.cookies.token;
    if (token) {
        try {
            jwt.verify(token, process.env.JWT_SECRET);
            return res.redirect('/');
        } catch (err) {
            // Invalid token, proceed
        }
    }
    next();
};

const logged = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
        req.flash('error_msg', 'Please log in to access this page.');
        return res.redirect('/login');
    }
    next();
};

module.exports = { verifyToken, ifLogged, logged };