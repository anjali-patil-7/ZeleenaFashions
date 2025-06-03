require("dotenv").config();
const express = require("express");
const session = require("express-session");
const flash = require("connect-flash");
const MongoStore = require("connect-mongo");
const passport = require("./config/passport");
const connectDB = require("./config/db");
const User = require("./models/userSchema");
const path = require("path");

const app = express();
connectDB();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    },
  })
);

// Flash middleware
app.use(flash());

// Global middleware to check for blocked users
app.use(async (req, res, next) => {
  // Skip middleware for static assets, login route, and favicon
  if (
    req.path.startsWith("/user/assets") ||
    req.path === "/login" ||
    req.path === "/favicon.ico"
  ) {
    return next();
  }

  if (req.session.userId) {
    try {
      const user = await User.findById(req.session.userId).lean();
      if (user && user.isBlocked) {
        req.flash(
          "error_msg",
          "Your account has been blocked by the admin. Please contact support."
        );
        return req.session.destroy((err) => {
          if (err) {
            return res.status(500).json({ error: "Failed to destroy session" });
          }
          res.set("Cache-Control", "no-store"); // Prevent caching
          return res.redirect("/login");
        });
      }
    } catch (err) {
      console.error("Error checking user status:", err);
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
  res.locals.error_msg = res.locals.error_msg || "";
  next();
});

// Routes
app.use("/admin", require("./routes/adminRoute"));
app.use("/", require("./routes/userRoute"));

// Authentication middleware
const verifySession = (req, res, next) => {
  if (!req.session.userId || !req.session.isAuth) {
    req.flash("error_msg", "Please log in to access this page.");
    return res.redirect("/login");
  }
  next();
};

const ifLogged = (req, res, next) => {
  if (req.session.userId && req.session.isAuth) {
    return res.redirect("/");
  }
  next();
};

const logged = (req, res, next) => {
  if (!req.session.userId || !req.session.isAuth) {
    req.flash("error_msg", "Please log in to access this page.");
    return res.redirect("/login");
  }
  next();
};

// Export middleware
module.exports = { verifySession, ifLogged, logged };

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Server running on port http://localhost:${PORT}`)
);
