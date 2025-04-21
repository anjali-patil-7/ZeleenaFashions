require('dotenv').config();
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const MongoStore = require('connect-mongo');
const passport = require('./config/passport');
const connectDB = require('./config/db');
const path = require('path');
const cookieParser = require('cookie-parser'); 

const app = express();
connectDB();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); 
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Add cookie-parser middleware
app.use(cookieParser()); 

// Session
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

// Flash middleware (must be after session)
app.use(flash());

// Passport (after session)
app.use(passport.initialize());
app.use(passport.session());

// Session locals and flash messages middleware
app.use((req, res, next) => {
  res.locals.session = req.session || {};
  res.locals.session.isAuth = req.session.isAuth || false;
  res.locals.messages = req.flash();
  next();
});

// Routes
app.use('/admin', require('./routes/adminRoute'));
app.use('/', require('./routes/userRoute'));

// Error handling for 404
app.use((req, res) => {
  res.status(404).render('user/404', { message: 'Page not found' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port http://localhost:${PORT}`));