require('dotenv').config();
const express = require('express');
const cors = require('cors')
const session = require('express-session');
const flash = require('connect-flash');
const MongoStore = require('connect-mongo');
const passport = require('./config/passport');
const connectDB = require('./config/db');
const path = require('path');
const cookieParser = require('cookie-parser');
const morgan = require('morgan')

const app = express();

connectDB();

// Log environment variables (for debugging)
console.log('Environment variables:', {
  NODE_ENV: process.env.NODE_ENV,
  MONGO_URI: process.env.MONGO_URI,
  SESSION_SECRET: process.env.SESSION_SECRET,
});

// Middleware
app.use(cors({
  origin: '*',
  credentials: true
}));

app.use(morgan('combined'))
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
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      // domain: process.env.COOKIE_DOMAIN || undefined,
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

// Session locals and flash messages middleware
app.use((req, res, next) => {
  res.locals.session = { ...req.session, isAuth: req.session.isAuth || false };
  res.locals.messages = req.flash();
  next();
});

// Global middleware to check for blocked users
app.use(async (req, res, next) => {
  if (
    req.path.startsWith('/user/assets') ||
    req.path === '/login' ||
    req.path === '/favicon.ico'
  ) {
    return next();
  }

  if (req.session.userId && req.session.isAuth) {
    try {
      const User = require('./models/userSchema');
      const user = await User.findById(req.session.userId).lean();
      if (user && user.isBlocked) {
        req.flash('error_msg', 'Your account has been blocked by the admin. Please contact support.');
        return req.session.destroy((err) => {
          if (err) {
            console.error('Session destroy error:', err);
            return res.status(500).json({ error: 'Failed to destroy session' });
          }
          res.set('Cache-Control', 'no-store');
          return res.redirect('/login');
        });
      }
    } catch (err) {
      console.error('Error checking user status:', err);
      req.flash('error_msg', 'An error occurred. Please log in again.');
      return res.redirect('/login');
    }
  }
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

app.listen(PORT, () => console.log(`Server running on port http://localhost:${PORT}`));