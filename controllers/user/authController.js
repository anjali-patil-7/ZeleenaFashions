const User = require('../../models/userSchema');
const OTP = require('../../models/otpSchema');
const transporter = require('../../config/nodemailer');
const passport = require('../../config/passport');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Render the signup page
exports.getSignup = (req, res) => {
    res.locals.session = req.session || {};
    res.locals.session.isAuth = req.session.isAuth || false;
    res.render('user/register', {
        errors: [],
        input: {},
        error_msg: req.session.error_msg || '',
        success_msg: req.session.success_msg || '',
        session: res.locals.session,
    });
    delete req.session.error_msg;
    delete req.session.success_msg;
};

// Render the login page
exports.getLogin = (req, res) => {
    res.locals.session = req.session || {};
    res.locals.session.isAuth = req.session.isAuth || false;
    res.render('user/login', {
        error_msg: req.session.error_msg || '',
        success_msg: req.session.success_msg || '',
        session: res.locals.session,
    });
    delete req.session.error_msg;
    delete req.session.success_msg;
};

// Handle signup form submission
exports.postSignup = async (req, res) => {
    const { userName, email, phone, password, confirmPassword } = req.body;
    let errors = [];

    try {
        // Name validation
        if (!userName) {
            errors.push('Name is required');
        } else if (userName.trim().length < 3) {
            errors.push('Name must be at least 3 characters long');
        } else if (!/^[A-Za-z\s]+$/.test(userName)) {
            errors.push('Name can only contain letters and spaces');
        }

        // Email validation
        if (!email) {
            errors.push('Email is required');
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            errors.push('Please enter a valid email address');
        }

        // Phone validation
        if (!phone) {
            errors.push('Phone number is required');
        } else if (!/^\d{10}$/.test(phone)) {
            errors.push('Phone number must be exactly 10 digits');
        }

        // Password validation
        if (!password) {
            errors.push('Password is required');
        } else if (password.length < 6) {
            errors.push('Password must be at least 6 characters long');
        }

        // Confirm password validation
        if (!confirmPassword) {
            errors.push('Please confirm your password');
        } else if (password !== confirmPassword) {
            errors.push('Passwords do not match');
        }

        // Check for existing email or phone
        const existingEmail = await User.findOne({ email });
        if (existingEmail) {
            errors.push('Email is already registered');
        }

        const existingPhone = await User.findOne({ phone });
        if (existingPhone) {
            errors.push('Phone number is already registered');
        }

        // If there are errors, render the form with error messages
        if (errors.length > 0) {
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/register', {
                errors,
                input: { userName, email, phone,  },
                error_msg: '',
                success_msg: '',
                session: res.locals.session,
            });
        }

        // Store signup data in session
        req.session.signupData = {
            name: userName,
            email,
            phone,
            password
        };

        // Generate and store OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        console.log('OTP>>>>>>>>>>', otp);
        await OTP.create({ email, otp });

        // Send OTP email
        await transporter.sendMail({
            to: email,
            subject: 'Zeleena Fashions - OTP for Signup',
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
        res.locals.session.isAuth = req.session.isAuth || false;
        return res.render('user/otp', {
            error_msg: '',
            success_msg: 'OTP sent to your email!',
            session: res.locals.session,
        });
    } catch (err) {
        console.error('Signup error:', err);
        errors.push('An unexpected error occurred. Please try again.');
        res.locals.session = req.session || {};
        res.locals.session.isAuth = req.session.isAuth || false;
        return res.render('user/register', {
            errors,
            input: { userName, email, phone},
            error_msg: '',
            success_msg: '',
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
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/otp', {
                error_msg: 'Session expired. Please try registering again.',
                success_msg: '',
                session: res.locals.session,
            });
        }

        if (!otp) {
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/otp', {
                error_msg: 'OTP is required',
                success_msg: '',
                session: res.locals.session,
            });
        }

        if (otp.length !== 6 || isNaN(otp)) {
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/otp', {
                error_msg: 'Please enter a valid 6-digit OTP',
                success_msg: '',
                session: res.locals.session,
            });
        }

        const otpRecord = await OTP.findOne({ email: signupData.email, otp });
        if (!otpRecord) {
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/otp', {
                error_msg: 'Invalid or expired OTP',
                success_msg: '',
                session: res.locals.session,
            });
        }

        const hashedPassword = await bcrypt.hash(signupData.password, 10);
        const user = await User.create({
            name: signupData.name,
            email: signupData.email,
            phone: signupData.phone,
            password: hashedPassword,
            isVerified: true
        });

        const token = jwt.sign(
            { id: user._id, isAdmin: user.isAdmin },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000,
        });

        req.session.isAuth = true;
        delete req.session.signupData;

        res.locals.session = req.session || {};
        res.locals.session.isAuth = req.session.isAuth;

        return res.redirect('/?success_msg=Registration+successful!');
    } catch (err) {
        console.error('OTP verification error:', err);
        res.locals.session = req.session || {};
        res.locals.session.isAuth = req.session.isAuth || false;
        return res.render('user/otp', {
            error_msg: 'An unexpected error occurred.',
            success_msg: '',
            session: res.locals.session,
        });
    }
};

// Handle OTP resend
exports.resendOTP = async (req, res) => {
    try {
        const signupData = req.session.signupData;
        if (!signupData) {
            return res.json({
                status: 'error',
                message: 'Session expired. Please try registering again.',
            });
        }

        const otp = Math.floor(100000 + Math.random() * 600000).toString();
        console.log('Otp>>>>>>',otp)
        await OTP.deleteMany({ email: signupData.email });
        await OTP.create({ email: signupData.email, otp });

        await transporter.sendMail({
            to: signupData.email,
            subject: 'Zeleena Fashions - OTP for Signup',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2>Zeleena Fashions</h2>
                    <p>Your new OTP for account verification is:</p>
                    <h3 style="color: #1D2951;">${otp}</h3>
                    <p>This OTP is valid for 1 minutes.</p>
                    <p>If you did not request this, please ignore this email.</p>
                </div>
            `,
        });

        return res.json({
            status: 'success',
            message: 'OTP resent successfully',
        });
    } catch (err) {
        console.error('Resend OTP error:', err);
        return res.json({
            status: 'error',
            message: 'Failed to resend OTP.',
        });
    }
};

// Handle login form submission
exports.postLogin = async (req, res) => {
    const { email, password } = req.body;

    try {
        // Email validation
        if (!email) {
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/login', {
                error_msg: 'Email is required',
                success_msg: '',
                session: res.locals.session,
            });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/login', {
                error_msg: 'Please enter a valid email address',
                success_msg: '',
                session: res.locals.session,
            });
        }

        // Password validation
        if (!password) {
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/login', {
                error_msg: 'Password is required',
                success_msg: '',
                session: res.locals.session,
            });
        }

        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/login', {
                error_msg: 'Invalid email or password',
                success_msg: '',
                session: res.locals.session,
            });
        }

        // Check if user is blocked
        if (user.isBlocked) {
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/login', {
                error_msg: 'Your account is blocked.',
                success_msg: '',
                session: res.locals.session,
            });
        }

        // Check if user is verified
        if (!user.isVerified) {
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/login', {
                error_msg: 'Please verify your account with OTP.',
                success_msg: '',
                session: res.locals.session,
            });
        }

        // Check if password is set (for Google auth users)
        if (!user.password) {
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/login', {
                error_msg: 'Please use Google login for this account.',
                success_msg: '',
                session: res.locals.session,
            });
        }

        // Compare password using bcrypt
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/login', {
                error_msg: 'Invalid email or password',
                success_msg: '',
                session: res.locals.session,
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: user._id, isAdmin: user.isAdmin },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        // Set token in cookie
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000,
        });

        // Update session
        req.session.isAuth = true;
        res.locals.session = req.session || {};
        res.locals.session.isAuth = req.session.isAuth;

        return res.redirect('/?success_msg=Login+successful!');
    } catch (err) {
        console.error('Login error:', err);
        res.locals.session = req.session || {};
        res.locals.session.isAuth = req.session.isAuth || false;
        return res.render('user/login', {
            error_msg: 'An unexpected error occurred. Please try again.',
            success_msg: '',
            session: res.locals.session,
        });
    }
};

// Handle Google authentication
exports.googleAuth = passport.authenticate('google', {
    scope: ['profile', 'email'],
});

// Handle Google authentication callback
exports.googleCallback = async (req, res, next) => {
    passport.authenticate('google', {
        failureRedirect: '/login',
        failureMessage: true,
    })(req, res, async () => {
        try {
            const user = req.user;
            if (!user) {
                req.session.error_msg = 'Google authentication failed.';
                return res.redirect('/login');
            }

            if (user.isBlocked) {
                req.session.error_msg = 'Your account is blocked.';
                return res.redirect('/login');
            }

            const token = jwt.sign(
                { id: user._id, isAdmin: user.isAdmin },
                process.env.JWT_SECRET,
                { expiresIn: '1d' }
            );

            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                maxAge: 24 * 60 * 60 * 1000,
            });

            req.session.isAuth = true;
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth;

            req.session.success_msg = 'Google login successful!';
            return res.redirect('/');
        } catch (err) {
            console.error('Google callback error:', err);
            req.session.error_msg = 'An unexpected error occurred.';
            return res.redirect('/login');
        }
    });
};

// Handle logout
exports.logout = (req, res) => {
    try {
        // Clear the token cookie
        res.clearCookie('token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
        });

        // Destroy the session
        req.session.destroy((err) => {
            if (err) {
                console.error('Session destruction error:', err);
                req.session.error_msg = 'Failed to log out. Please try again.';
                return res.redirect('/profile');
            }

            // Redirect to login page with success message
            res.redirect('/login');
        });
    } catch (err) {
        console.error('Logout error:', err);
        req.session.error_msg = 'An unexpected error occurred.';
        res.redirect('/profile');x
    }
};

// Render the forgot password page
exports.getForgotPassword = (req, res) => {
    res.locals.session = req.session || {};
    res.locals.session.isAuth = req.session.isAuth || false;
    res.render('user/forgot', {
        error_msg: req.session.error_msg || '',
        success_msg: req.session.success_msg || '',
        session: res.locals.session,
    });
    delete req.session.error_msg;
    delete req.session.success_msg;
};

// Handle forgot password form submission
exports.postForgotPassword = async (req, res) => {
    const { email } = req.body;

    try {
        // Email validation
        if (!email) {
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/forgot', {
                error_msg: 'Email is required',
                success_msg: '',
                session: res.locals.session,
            });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/forgot', {
                error_msg: 'Please enter a valid email address',
                success_msg: '',
                session: res.locals.session,
            });
        }

        // Check if user exists
        const user = await User.findOne({ email });
        if (!user) {
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/forgot', {
                error_msg: 'No account found with this email',
                success_msg: '',
                session: res.locals.session,
            });
        }

        // Check if user is blocked
        if (user.isBlocked) {
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/forgot', {
                error_msg: 'Your account is blocked.',
                success_msg: '',
                session: res.locals.session,
            });
        }

        // Store email in session for OTP verification
        req.session.forgotPasswordData = { email };

        // Generate and store OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        console.log('Otp>>>>>>',otp)
        await OTP.create({ email, otp });

        // Send OTP email
        await transporter.sendMail({
            to: email,
            subject: 'Zeleena Fashions - OTP for Password Reset',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2>Zeleena Fashions</h2>
                    <p>Your OTP for password reset is:</p>
                    <h3 style="color: #1D2951;">${otp}</h3>
                    <p>This OTP is valid for 1 minutes.</p>
                    <p>If you did not request this, please ignore this email.</p>
                </div>
            `,
        });

        res.locals.session = req.session || {};
        res.locals.session.isAuth = req.session.isAuth || false;
        return res.render('user/forgot-otp', {
            error_msg: '',
            success_msg: 'OTP sent to your email!',
            session: res.locals.session,
        });
    } catch (err) {
        console.error('Forgot password error:', err);
        res.locals.session = req.session || {};
        res.locals.session.isAuth = req.session.isAuth || false;
        return res.render('user/forgot', {
            error_msg: 'An unexpected error occurred. Please try again.',
            success_msg: '',
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
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/forgot-otp', {
                error_msg: 'Session expired. Please try resetting your password again.',
                success_msg: '',
                session: res.locals.session,
            });
        }

        if (!otp) {
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/forgot-otp', {
                error_msg: 'OTP is required',
                success_msg: '',
                session: res.locals.session,
            });
        }

        if (otp.length !== 6 || isNaN(otp)) {
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/forgot-otp', {
                error_msg: 'Please enter a valid 6-digit OTP',
                success_msg: '',
                session: res.locals.session,
            });
        }

        const otpRecord = await OTP.findOne({ email: forgotPasswordData.email, otp });
        if (!otpRecord) {
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/forgot-otp', {
                error_msg: 'Invalid or expired OTP',
                success_msg: '',
                session: res.locals.session,
            });
        }

        // OTP is valid, render reset password page
        res.locals.session = req.session || {};
        res.locals.session.isAuth = req.session.isAuth || false;
        return res.render('user/reset-password', {
            error_msg: '',
            success_msg: 'Please enter your new password.',
            session: res.locals.session,
        });
    } catch (err) {
        console.error('Forgot password OTP verification error:', err);
        res.locals.session = req.session || {};
        res.locals.session.isAuth = req.session.isAuth || false;
        return res.render('user/forgot-otp', {
            error_msg: 'An unexpected error occurred.',
            success_msg: '',
            session: res.locals.session,
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
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/reset-password', {
                error_msg: 'Session expired. Please try resetting your password again.',
                success_msg: '',
                session: res.locals.session,
            });
        }

        // Password validation
        if (!newPassword) {
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/reset-password', {
                error_msg: 'New password is required',
                success_msg: '',
                session: res.locals.session,
            });
        }

        if (newPassword.length < 8) {
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/reset-password', {
                error_msg: 'Password must be at least 8 characters long',
                success_msg: '',
                session: res.locals.session,
            });
        }

        if (!/[A-Z]/.test(newPassword)) {
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/reset-password', {
                error_msg: 'Password must contain at least one uppercase letter',
                success_msg: '',
                session: res.locals.session,
            });
        }

        if (!/[a-z]/.test(newPassword)) {
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/reset-password', {
                error_msg: 'Password must contain at least one lowercase letter',
                success_msg: '',
                session: res.locals.session,
            });
        }

        if (!/[0-9]/.test(newPassword)) {
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/reset-password', {
                error_msg: 'Password must contain at least one number',
                success_msg: '',
                session: res.locals.session,
            });
        }

        if (!/[^A-Za-z0-9]/.test(newPassword)) {
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/reset-password', {
                error_msg: 'Password must contain at least one special character',
                success_msg: '',
                session: res.locals.session,
            });
        }

        if (!confirmPassword) {
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/reset-password', {
                error_msg: 'Please confirm your password',
                success_msg: '',
                session: res.locals.session,
            });
        }

        if (newPassword !== confirmPassword) {
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/reset-password', {
                error_msg: 'Passwords do not match',
                success_msg: '',
                session: res.locals.session,
            });
        }

        // Find user
        const user = await User.findOne({ email: forgotPasswordData.email });
        if (!user) {
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/reset-password', {
                error_msg: 'User not found.',
                success_msg: '',
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
        res.redirect('/login?success_msg=Password+reset+successfully!');
    } catch (err) {
        console.error('Reset password error:', err);
        res.locals.session = req.session || {};
        res.locals.session.isAuth = req.session.isAuth || false;
        return res.render('user/reset-password', {
            error_msg: 'An unexpected error occurred. Please try again.',
            success_msg: '',
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
                status: 'error',
                message: 'Session expired. Please try resetting your password again.',
            });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        console.log('forgotOtp>>>>>>',otp)
        await OTP.deleteMany({ email: forgotPasswordData.email });
        await OTP.create({ email: forgotPasswordData.email, otp });

        await transporter.sendMail({
            to: forgotPasswordData.email,
            subject: 'Zeleena Fashions - OTP for Password Reset',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2>Zeleena Fashions</h2>
                    <p>Your new OTP for password reset is:</p>
                    <h3 style="color: #1D2951;">${otp}</h3>
                    <p>This OTP is valid for 1 minutes.</p>
                    <p>If you did not request this, please ignore this email.</p>
                </div>
            `,
        });

        return res.json({
            status: 'success',
            message: 'OTP resent successfully',
        });
    } catch (err) {
        console.error('Resend forgot password OTP error:', err);
        return res.json({
            status: 'error',
            message: 'Failed to resend OTP.',
        });
    }
};

//Handle change password form submission
exports.changePassword = async(req,res)=>{
    const {current_password,new_password,confirm_password} = req.body;
    try{
        if( !new_password || !confirm_password){
            return res.json({
                success : false,
                message : 'New password and confirm password are required'
            })
        }
        //validate new password length
        if(new_password.length < 6){
            return res.json({
                success:false,
                message:'New password must be at least 6 characters long'
            })
        }
        //check if new password and confirm password match
        if(new_password !== confirm_password){
            return res.json({
                success:false,
                message:'New password and confirm password do not match'
            })
        }
        //get authenticate user
        const userId = req.user.id;
        const user = await user.findById(userId)

        if(!user){
            return res.json({
                success:false,
                message:'user not found'
            })
        }
        if(user.password){
            if(!current_password){
                return res.json({
                    success:false,
                    message:'current password is required'
                })
            }
            //verify current password
            const isMatch = await bcrypt.compare(current_password,user.password)
            if(!isMatch){
                return res.json({
                    success:false,
                    message:'Current password is incorrect'
                })
            }
            //check if new password is different from current password 
            const isSamepassword = await bcrypt.compare(new_password,user.password)
            if(isSamepassword){
                return res.json({
                    success:false,
                    message:'New password must be different from current password'
                })
            }
        }else{
            //if user doesnt have a password
            if(current_password){
                return res.json({
                    success:false,
                    message:'No current password exists for this account. Leave the current password field empty'
                })
            }
        }
        //Hash new password
        const hashedPassword = await bcrypt.hash(new_password,10)
        //update user's password
        user.password = hashedPassword;
        await user.save()

        //send success respose
        return res.json({
            success:true,
            message:'password changed successfully'
        })
    }catch(err){
        console.error('change password error:',err)
        return res.json({
            success:false,
            message:'An unexcepted error occurred . Please try again'
        })
    }
}