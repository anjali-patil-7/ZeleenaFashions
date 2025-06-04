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

// Log environment variables
console.log('Environment variables:', {
  NODE_ENV: process.env.NODE_ENV,
  MONGO_URI: process.env.MONGO_URI,
  SESSION_SECRET: process.env.SESSION_SECRET,
  JWT_SECRET: process.env.JWT_SECRET,
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN,
});

// Middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Cookie-parser middleware
app.use(cookieParser());

// Session middleware
const sessionStore = MongoStore.create({
  mongoUrl: process.env.MONGO_URI,
  collectionName: 'sessions',
});
sessionStore.on('error', (error) => {
  console.error('Session store error:', error);
});
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
      domain: process.env.COOKIE_DOMAIN || undefined,
    },
  })
);

// Flash middleware
app.use(flash());

// Prevent caching
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

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
          domain: process.env.COOKIE_DOMAIN || undefined,
        });
        return req.session.destroy((err) => {
          if (err) {
            return res.status(500).json({ error: 'Failed to destroy session' });
          }
          res.set('Cache-Control', 'no-store');
          return res.redirect('/login');
        });
      }
    } catch (err) {
      res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        domain: process.env.COOKIE_DOMAIN || undefined,
      });
    }
  }
  console.log('Middleware: req.session:', req.session);
  console.log('Middleware: res.locals.session:', res.locals.session);
  next();
});

// Session locals and flash messages middleware
app.use((req, res, next) => {
  res.locals.session = req.session || {};
  res.locals.session.isAuth = req.session.isAuth || false;
  res.locals.messages = req.flash();
  next();
});

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Error handling middleware
app.use((req, res, next) => {
  res.locals.error = null;
  next();
});

// Routes
app.use('/admin', require('./routes/adminRoute'));
app.use('/', require('./routes/userRoute'));

const PORT = process.env.PORT || 3000;

app.listen(PORT, () =>  console.log(`Server running on port http://localhost:${PORT}`)
);
