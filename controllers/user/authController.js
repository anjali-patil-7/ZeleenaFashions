const User = require("../../models/userSchema");
const OTP = require("../../models/otpSchema");
const transporter = require("../../config/nodemailer");
const passport = require("../../config/passport");
const crypto = require("crypto")
const bcrypt = require("bcryptjs");

//referal code
const generateReferralCode = (userId) => {
  const randomBytes = crypto.randomBytes(3).toString("hex");
  return `REF${userId.substring(0, 5)}${randomBytes}`.toUpperCase();
};

// Render the signup page
exports.getSignup = (req, res) => {
  res.locals.session = req.session || {};
  res.locals.session.isAuth = req.session.user ? req.session.user.isAuth : false;
  res.render("user/register", {
    errors: [],
    input: {},
    error_msg: req.flash("error_msg") || "",
    success_msg: req.flash("success_msg") || "",
    session: res.locals.session,
  });
};

// Render the login page
exports.getLogin = (req, res) => {
  console.log("getLogin:",req.session);
  res.locals.session = req.session || {};
  res.locals.session.isAuth = req.session.user ? req.session.user.isAuth : false;
  console.log("getLogin: Flash error_msg:", req.flash("error_msg"));
  res.render("user/login", {
    error_msg: req.flash("error_msg") || "",
    success_msg: req.flash("success_msg") || "",
    session: res.locals.session,
  });
};

// Handle signup form submission
exports.postSignup = async (req, res) => {
  const { userName, email, phone, password, confirmPassword, referralCode } = req.body;
  let errors = [];

  try {
    // Name validation
    if (!userName) {
      errors.push("Name is required");
    } else if (/^\s/.test(userName)) {
      errors.push("Name should not start with a space");
    } else if (userName.trim().length < 3) {
      errors.push("Name must be at least 3 characters long");
    } else if (!/^[A-Za-z]+(?:\s[A-Za-z]+)*$/.test(userName.trim())) {
      errors.push("Name can only contain letters and single spaces between words");
    }

    // Email validation
    if (!email) {
      errors.push("Email is required");
    } else if (email.startsWith(" ")) {
      errors.push("Email must not start with a space");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push("Please enter a valid email address");
    }

    // Phone validation
    if (!phone) {
      errors.push("Phone number is required");
    } else if (!/^[6-9]\d{9}$/.test(phone)) {
      errors.push("Phone number must be 10 digits and start with 6, 7, 8, or 9");
    } else if (/^(\d)\1{9}$/.test(phone)) {
      errors.push("Phone number cannot have all repeating digits");
    } else if (/\s/.test(phone)) {
      errors.push("Phone number must not contain any spaces");
    }

    // Password validation
    if (!password) {
      errors.push("Password is required");
    } else if (password.length < 6) {
      errors.push("Password must be at least 6 characters long");
    } else if (!/[A-Z]/.test(password)) {
      errors.push("Password must contain at least one uppercase letter");
    } else if (!/[a-z]/.test(password)) {
      errors.push("Password must contain at least one lowercase letter");
    } else if (!/\d/.test(password)) {
      errors.push("Password must contain at least one number");
    } else if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
      errors.push("Password must contain at least one special character");
    } else if (/\s/.test(password)) {
      errors.push("Password must not contain any spaces");
    }

    // Confirm password validation
    if (!confirmPassword) {
      errors.push("Please confirm your password");
    } else if (password !== confirmPassword) {
      errors.push("Passwords do not match");
    }

    // Check for existing email or phone
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      errors.push("Email is already registered");
    }

    const existingPhone = await User.findOne({ phone });
    if (existingPhone) {
      errors.push("Phone number is already registered");
    }

    // If there are errors, render the form with error messages
    if (errors.length > 0) {
      res.locals.session = req.session || {};
      res.locals.session.isAuth = req.session.user ? req.session.user.isAuth : false;
      return res.render("user/register", {
        errors,
        input: { userName, email, phone },
        error_msg: "",
        success_msg: "",
        session: res.locals.session,
      });
    }

    // Store signup data in session
    req.session.signupData = {
      name: userName,
      email,
      phone,
      password,
      referralCode
    };

    // Generate and store OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log("OTP>>>>>>>>>>", otp);
    await OTP.create({ email, otp });

    // Send OTP email
    await transporter.sendMail({
      to: email,
      subject: "Zeleena Fashions - OTP for Signup",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Zeleena Fashions</h2>
          <p>Your OTP for account verification is:</p>
          <h3 style="color: #1D2951;">${otp}</h3>
          <p>This OTP is valid for 1 minute.</p>
          <p>If you did not request this, please ignore this email.</p>
        </div>
      `,
    });

    res.locals.session = req.session || {};
    res.locals.session.isAuth = req.session.user ? req.session.user.isAuth : false;
    return res.render("user/otp", {
      error_msg: "",
      success_msg: "OTP sent to your email!",
      session: res.locals.session,
    });
  } catch (err) {
    console.error("Signup error:", err);
    errors.push("An unexpected error occurred. Please try again.");
    res.locals.session = req.session || {};
    res.locals.session.isAuth = req.session.user ? req.session.user.isAuth : false;
    return res.render("user/register", {
      errors,
      input: { userName, email, phone },
      error_msg: "",
      success_msg: "",
      session: res.locals.session,
    });
  }
};

// Handle OTP verification
exports.verifyOTP = async (req, res) => {
  const { otp } = req.body;

  try {
    const signupData = req.session.signupData;
    if (!signupData) {
      return res.json({
        status: "error",
        message: "Session expired. Please try registering again.",
      });
    }

    if (!otp) {
      return res.json({
        status: "error",
        message: "OTP is required",
      });
    }

    if (otp.length !== 6 || isNaN(otp)) {
      return res.json({
        status: "error",
        message: "Please enter a valid 6-digit OTP",
      });
    }

    const otpRecord = await OTP.findOne({ email: signupData.email, otp });
    if (!otpRecord) {
      return res.json({
        status: "error",
        message: "Wrong OTP entered. Please try again.",
      });
    }

    const currentTime = new Date();
    const otpCreationTime = new Date(otpRecord.createdAt);
    const timeDifference = (currentTime - otpCreationTime) / 1000;

    if (timeDifference > 60) {
      return res.json({
        status: "error",
        message: "OTP has expired. Please request a new one.",
      });
    }

    // Proceed with user creation and authentication
    const hashedPassword = await bcrypt.hash(signupData.password, 10);
    const user = await User.create({
      name: signupData.name,
      email: signupData.email,
      phone: signupData.phone,
      password: hashedPassword,
      isVerified: true,
    });

    // Store user data in session and clear admin data
    req.session.user = {
      id: user._id,
      isAuth: true,
      isAdmin: user.isAdmin
    };
    delete req.session.admin;
    delete req.session.signupData;

    return res.json({
      status: "success",
      message: "Registration successful!",
    });
  } catch (err) {
    console.error("OTP verification error:", err);
    return res.json({
      status: "error",
      message: "An unexpected error occurred.",
    });
  }
};

// Handle OTP resend
exports.resendOTP = async (req, res) => {
  try {
    const signupData = req.session.signupData;
    if (!signupData) {
      return res.json({
        status: "error",
        message: "Session expired. Please try registering again.",
      });
    }

    const otp = Math.floor(100000 + Math.random() * 600000).toString();
    console.log("Otp>>>>>>", otp);
    await OTP.deleteMany({ email: signupData.email });
    await OTP.create({ email: signupData.email, otp });

    await transporter.sendMail({
      to: signupData.email,
      subject: "Zeleena Fashions - OTP for Signup",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Zeleena Fashions</h2>
          <p>Your new OTP for account verification is:</p>
          <h3 style="color: #1D2951;">${otp}</h3>
          <p>This OTP is valid for 1 minute.</p>
          <p>If you did not request this, please ignore this email.</p>
        </div>
      `,
    });

    return res.json({
      status: "success",
      message: "OTP resent successfully",
    });
  } catch (err) {
    console.error("Resend OTP error:", err);
    return res.json({
      status: "error",
      message: "Failed to resend OTP.",
    });
  }
};

// Handle login form submission
exports.postLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Email validation
    if (!email) {
      req.flash('error_msg', 'Email is required');
      return res.redirect('/login');
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      req.flash('error_msg', 'Please enter a valid email address');
      return res.redirect('/login');
    }

    // Password validation
    if (!password) {
      req.flash('error_msg', 'Password is required');
      return res.redirect('/login');
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      req.flash('error_msg', 'Invalid email or password');
      return res.redirect('/login');
    }

    // Check if user is blocked
    
    if (user.isBlocked) {
      console.log("BLOCKED TRUE")
      req.flash(
        "error_msg",
        "Your account is blocked. Please contact support."
      );
      return res.redirect("/login");
    }    

    // Check if user is verified
    if (!user.isVerified) {
      req.flash('error_msg', 'Please verify your account with OTP.');
      return res.redirect('/login');
    }

    // Check if password is set (for Google auth users)
    if (!user.password) {
      req.flash('error_msg', 'Please use Google login for this account.');
      return res.redirect('/login');
    }

    // Compare password using bcrypt
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      req.flash('error_msg', 'Invalid email or password');
      return res.redirect('/login');
    }

    // Store user data in session and clear admin data
    req.session.user = {
      id: user._id,
      isAuth: true,
      isAdmin: user.isAdmin
    };
    delete req.session.admin;

    req.session.save((err) => {
      if (err) {
        console.error('Session save error in postLogin:', err);
        req.flash('error_msg', 'Failed to save session. Please try again.');
        return res.redirect('/login');
      }
      console.log('postLogin: Session saved successfully:', req.session);
      res.locals.session = { ...req.session, isAuth: req.session.user ? req.session.user.isAuth : false };
      console.log('postLogin: res.locals.session:', res.locals.session);
      return res.redirect('/?success_msg=Login+successful!');
    });
  } catch (err) {
    console.error('Login error:', err);
    req.flash('error_msg', 'An unexpected error occurred. Please try again.');
    return res.redirect('/login');
  }
};

// Handle Google authentication
exports.googleAuth = passport.authenticate("google", {
  scope: ["profile", "email"],
});

// Handle Google authentication callback
exports.googleCallback = async (req, res, next) => {
  passport.authenticate("google", {
    failureRedirect: "/login",
    failureMessage: true,
  })(req, res, async () => {
    try {
     
      const user = req.user;
      console.log("user1:", user);
      if (!user) {
        req.flash("error_msg", "Google authentication failed.");
        return res.render("/login");
      }

      if (user.isBlocked) {
        req.flash("error_msg", "Your account is blocked.");
        return res.redirect("/login");
      }
      

      // Store user data in session and clear admin data
      req.session.user = {
        id: user._id,
        isAuth: true,
        isAdmin: user.isAdmin
      };
      delete req.session.admin;

      res.locals.session = req.session || {};
      res.locals.session.isAuth = req.session.user ? req.session.user.isAuth : false;

      req.flash("success_msg", "Google login successful!");
      return res.redirect("/");
    } catch (err) {
      console.error("Google callback error:", err);
      req.flash("error_msg", "An unexpected error occurred.");
      return res.redirect("/login");
    }
  });
};

// Handle logout
exports.logout = (req, res) => {
  try {
    // Clear user session data, preserve admin if present
    delete req.session.user;
    req.session.isAuth = false; // Reset for safety
    req.session.save((err) => {
      if (err) {
        console.error("Session destruction error:", err);
        req.flash("error_msg", "Failed to log out. Please try again.");
        return res.redirect("/profile");
      }
      res.redirect("/login");
    });
  } catch (err) {
    console.error("Logout error:", err);
    req.flash("error_msg", "An unexpected error occurred.");
    res.redirect("/profile");
  }
};

// Render the forgot password page
exports.getForgotPassword = (req, res) => {
  res.locals.session = req.session || {};
  res.locals.session.isAuth = req.session.user ? req.session.user.isAuth : false;
  res.render("user/forgot", {
    error_msg: req.flash("error_msg") || "",
    success_msg: req.flash("success_msg") || "",
    session: res.locals.session,
  });
};

// Handle forgot password form submission
exports.postForgotPassword = async (req, res) => {
  const { email } = req.body;
  console.log("forget email>>>>", req.body);
  try {
    // Email validation
    if (!email) {
      res.locals.session = req.session || {};
      res.locals.session.isAuth = req.session.user ? req.session.user.isAuth : false;
      return res.render("user/forgot", {
        error_msg: "Email is required",
        success_msg: "",
        session: res.locals.session,
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.locals.session = req.session || {};
      res.locals.session.isAuth = req.session.user ? req.session.user.isAuth : false;
      return res.render("user/forgot", {
        error_msg: "Please enter a valid email address",
        success_msg: "",
        session: res.locals.session,
      });
    }

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      res.locals.session = req.session || {};
      res.locals.session.isAuth = req.session.user ? req.session.user.isAuth : false;
      return res.render("user/forgot", {
        error_msg: "No account found with this email",
        success_msg: "",
        session: res.locals.session,
      });
    }

    // Check if user is blocked
    if (user.isBlocked) {
      res.locals.session = req.session || {};
      res.locals.session.isAuth = req.session.user ? req.session.user.isAuth : false;
      return res.render("user/forgot", {
        error_msg: "Your account is blocked.",
        success_msg: "",
        session: res.locals.session,
      });
    }

    // Store email in session for OTP verification
    req.session.forgotPasswordData = { email };

    // Generate and store OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log("Otp>>>>>>", otp);
    await OTP.create({ email, otp });

    // Send OTP email
    await transporter.sendMail({
      to: email,
      subject: "Zeleena Fashions - OTP for Password Reset",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Zeleena Fashions</h2>
          <p>Your OTP for password reset is:</p>
          <h3 style="color: #1D2951;">${otp}</h3>
          <p>This OTP is valid for 1 minute.</p>
          <p>If you did not request this, please ignore this email.</p>
        </div>
      `,
    });

    res.locals.session = req.session || {};
    res.locals.session.isAuth = req.session.user ? req.session.user.isAuth : false;
    return res.render("user/forgot-otp", {
      error_msg: "",
      success_msg: "OTP sent to your email!",
      session: res.locals.session,
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.locals.session = req.session || {};
    res.locals.session.isAuth = req.session.user ? req.session.user.isAuth : false;
    return res.render("user/forgot", {
      error_msg: "An unexpected error occurred. Please try again.",
      success_msg: "",
      session: res.locals.session,
    });
  }
};

// Handle forgot password OTP verification
exports.verifyForgotPasswordOTP = async (req, res) => {
  const { otp } = req.body;
  try {
    const forgotPasswordData = req.session.forgotPasswordData;
    if (!forgotPasswordData) {
      return res.json({
        status: "error",
        message: "Session expired. Please try resetting your password again.",
      });
    }

    if (!otp) {
      return res.json({
        status: "error",
        message: "OTP is required",
      });
    }

    if (otp.length !== 6 || isNaN(otp)) {
      return res.json({
        status: "error",
        message: "Please enter a valid 6-digit OTP",
      });
    }

    const otpRecord = await OTP.findOne({
      email: forgotPasswordData.email,
      otp,
    });
    if (!otpRecord) {
      return res.json({
        status: "error",
        message: "Wrong OTP entered. Please try again.",
      });
    }

    const currentTime = new Date();
    const otpCreationTime = new Date(otpRecord.createdAt);
    const timeDifference = (currentTime - otpCreationTime) / 1000;

    if (timeDifference > 60) {
      return res.json({
        status: "error",
        message: "OTP has expired. Please request a new one.",
      });
    }

    // OTP is valid
    return res.json({
      status: "success",
      message: "OTP verified successfully.",
      redirect: "/reset-password",
    });
  } catch (err) {
    console.error("Forgot password OTP verification error:", err);
    return res.json({
      status: "error",
      message: "An unexpected error occurred.",
    });
  }
};

// Handle password reset form submission
exports.resetPassword = async (req, res) => {
  const { newPassword, confirmPassword } = req.body;

  try {
    const forgotPasswordData = req.session.forgotPasswordData;
    if (!forgotPasswordData) {
      res.locals.session = req.session || {};
      res.locals.session.isAuth = req.session.user ? req.session.user.isAuth : false;
      return res.render("user/reset-password", {
        error_msg: "Session expired. Please try resetting your password again.",
        success_msg: "",
        session: res.locals.session,
      });
    }

    // Password validation
    if (!newPassword) {
      res.locals.session = req.session || {};
      res.locals.session.isAuth = req.session.user ? req.session.user.isAuth : false;
      return res.render("user/reset-password", {
        error_msg: "New password is required",
        success_msg: "",
        session: res.locals.session,
      });
    }

    if (newPassword.length < 8) {
      res.locals.session = req.session || {};
      res.locals.session.isAuth = req.session.user ? req.session.user.isAuth : false;
      return res.render("user/reset-password", {
        error_msg: "Password must be at least 8 characters long",
        success_msg: "",
        session: res.locals.session,
      });
    }

    if (!/[A-Z]/.test(newPassword)) {
      res.locals.session = req.session || {};
      res.locals.session.isAuth = req.session.user ? req.session.user.isAuth : false;
      return res.render("user/reset-password", {
        error_msg: "Password must contain at least one uppercase letter",
        success_msg: "",
        session: res.locals.session,
      });
    }

    if (!/[a-z]/.test(newPassword)) {
      res.locals.session = req.session || {};
      res.locals.session.isAuth = req.session.user ? req.session.user.isAuth : false;
      return res.render("user/reset-password", {
        error_msg: "Password must contain at least one lowercase letter",
        success_msg: "",
        session: res.locals.session,
      });
    }

    if (!/[0-9]/.test(newPassword)) {
      res.locals.session = req.session || {};
      res.locals.session.isAuth = req.session.user ? req.session.user.isAuth : false;
      return res.render("user/reset-password", {
        error_msg: "Password must contain at least one number",
        success_msg: "",
        session: res.locals.session,
      });
    }

    if (!/[^A-Za-z0-9]/.test(newPassword)) {
      res.locals.session = req.session || {};
      res.locals.session.isAuth = req.session.user ? req.session.user.isAuth : false;
      return res.render("user/reset-password", {
        error_msg: "Password must contain at least one special character",
        success_msg: "",
        session: res.locals.session,
      });
    }

    if (!confirmPassword) {
      res.locals.session = req.session || {};
      res.locals.session.isAuth = req.session.user ? req.session.user.isAuth : false;
      return res.render("user/reset-password", {
        error_msg: "Please confirm your password",
        success_msg: "",
        session: res.locals.session,
      });
    }

    if (newPassword !== confirmPassword) {
      res.locals.session = req.session || {};
      res.locals.session.isAuth = req.session.user ? req.session.user.isAuth : false;
      return res.render("user/reset-password", {
        error_msg: "Passwords do not match",
        success_msg: "",
        session: res.locals.session,
      });
    }

    // Find user
    const user = await User.findOne({ email: forgotPasswordData.email });
    if (!user) {
      res.locals.session = req.session || {};
      res.locals.session.isAuth = req.session.user ? req.session.user.isAuth : false;
      return res.render("user/reset-password", {
        error_msg: "User not found.",
        success_msg: "",
        session: res.locals.session,
      });
    }

    // Hash new password and update user
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    // Clear session data
    delete req.session.forgotPasswordData;

    // Redirect to login with success message
    res.redirect("/login?success_msg=Password+reset+successfully!");
  } catch (err) {
    console.error("Reset password error:", err);
    res.locals.session = req.session || {};
    res.locals.session.isAuth = req.session.user ? req.session.user.isAuth : false;
    return res.render("user/reset-password", {
      error_msg: "An unexpected error occurred. Please try again.",
      success_msg: "",
      session: res.locals.session,
    });
  }
};

// Handle forgot password OTP resend
exports.resendForgotPasswordOTP = async (req, res) => {
  try {
    const forgotPasswordData = req.session.forgotPasswordData;
    if (!forgotPasswordData) {
      return res.json({
        status: "error",
        message: "Session expired. Please try resetting your password again.",
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log("forgotOtp>>>>>>", otp);
    await OTP.deleteMany({ email: forgotPasswordData.email });
    await OTP.create({ email: forgotPasswordData.email, otp });

    await transporter.sendMail({
      to: forgotPasswordData.email,
      subject: "Zeleena Fashions - OTP for Password Reset",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Zeleena Fashions</h2>
          <p>Your new OTP for password reset is:</p>
          <h3 style="color: #1D2951;">${otp}</h3>
          <p>This OTP is valid for 1 minute.</p>
          <p>If you did not request this, please ignore this email.</p>
        </div>
      `,
    });

    return res.json({
      status: "success",
      message: "OTP resent successfully",
    });
  } catch (err) {
    console.error("Resend forgot password OTP error:", err);
    return res.json({
      status: "error",
      message: "Failed to resend OTP.",
    });
  }
};

// Handle change password form submission
exports.changePassword = async (req, res) => {
  const { current_password, new_password, confirm_password } = req.body;
  try {
    if (!new_password || !confirm_password) {
      return res.json({
        success: false,
        message: "New password and confirm password are required",
      });
    }
    // Validate new password length
    if (new_password.length < 6) {
      return res.json({
        success: false,
        message: "New password must be at least 6 characters long",
      });
    }
    // Check if new password and confirm password match
    if (new_password !== confirm_password) {
      return res.json({
        success: false,
        message: "New password and confirm password do not match",
      });
    }
    // Get authenticated user from session
    const userId = req.session.user ? req.session.user.id : null;
    if (!userId) {
      return res.json({
        success: false,
        message: "You must be logged in to change your password",
      });
    }
    const user = await User.findById(userId);

    if (!user) {
      return res.json({
        success: false,
        message: "User not found",
      });
    }
    if (user.password) {
      if (!current_password) {
        return res.json({
          success: false,
          message: "Current password is required",
        });
      }
      // Verify current password
      const isMatch = await bcrypt.compare(current_password, user.password);
      if (!isMatch) {
        return res.json({
          success: false,
          message: "Current password is incorrect",
        });
      }
      // Check if new password is different from current password
      const isSamePassword = await bcrypt.compare(new_password, user.password);
      if (isSamePassword) {
        return res.json({
          success: false,
          message: "New password must be different from current password",
        });
      }
    } else {
      // If user doesn't have a password
      if (current_password) {
        return res.json({
          success: false,
          message: "No current password exists for this account. Leave the current password field empty",
        });
      }
    }
    // Hash new password
    const hashedPassword = await bcrypt.hash(new_password, 10);
    // Update user's password
    user.password = hashedPassword;
    await user.save();

    // Send success response
    return res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (err) {
    console.error("Change password error:", err);
    return res.json({
      success: false,
      message: "An unexpected error occurred. Please try again",
    });
  }
};