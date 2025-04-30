require('dotenv').config();
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const MongoStore = require('connect-mongo');
const passport = require('./config/passport');
const jwt = require('jsonwebtoken');
const connectDB = require('./config/db');
const User = require('./models/userSchema');
const path = require('path');
const cookieParser = require('cookie-parser');

const app = express();
connectDB();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Add cookie-parser middleware
app.use(cookieParser());

// Session middleware (must be before flash)
app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000, // 1 day
        },
    })
);

// Flash middleware
app.use(flash());

// Global middleware to check for blocked users
app.use(async (req, res, next) => {
    const token = req.cookies.token;

    // Skip middleware for static assets, login route, and favicon
    if (
        req.path.startsWith('/user/assets') ||
        req.path === '/login' ||
        req.path === '/favicon.ico'
    ) {
        return next();
    }

    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id).lean();
            if (user && user.isBlocked) {
                req.flash('error_msg', 'Your account has been blocked by the admin. Please contact support.');
                res.clearCookie('token', {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                });
                return req.session.destroy((err) => {
                    if (err) {
                        return res.status(500).json({ error: 'Failed to destroy session' });
                    }
                    res.set('Cache-Control', 'no-store'); // Prevent caching
                    return res.redirect('/login');
                });
            }
        } catch (err) {
            res.clearCookie('token', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
            });
        }
    }
    next();
});

// Session locals and flash messages middleware
app.use((req, res, next) => {
    res.locals.session = req.session || {};
    res.locals.session.isAuth = req.session.isAuth || false;
    res.locals.messages = req.flash();
    next();
});

// Passport (after session)
app.use(passport.initialize());
app.use(passport.session());

// Error handling middleware
app.use((req, res, next) => {
    res.locals.error_msg = res.locals.error_msg || '';
    next();
});

// Routes
app.use('/admin', require('./routes/adminRoute'));
app.use('/', require('./routes/userRoute'));

// // Error handling for 404
// app.use((req, res, next) => {
//     console.error(`404 - Route not found: ${req.method} ${req.originalUrl}`);
//     res.status(404).render('user/404', {
//         error_msg: 'Page not found',
//     });
// });

// Global error handler
// app.use((err, req, res, next) => {
//     console.error('Global error:', err.stack);
//     res.status(500).render('user/500', {
//         error_msg: 'Something went wrong!',
//     });
// });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port http://localhost:${PORT}`));