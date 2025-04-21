const { body, validationResult } = require('express-validator');
const User = require('../../models/userSchema');
const OTP = require('../../models/otpSchema');
const transporter = require('../../config/nodemailer');
const bcrypt = require('bcryptjs');

// Render the profile page
exports.getProfile = async (req, res) => {
    try {
        // req.user should be set by verifyToken middleware
        if (!req.user) {
            req.session.error_msg = 'Please log in to view your profile.';
            return res.redirect('/login');
        }

        // Fetch user data
        const user = await User.findById(req.user.id).lean();
        if (!user) {
            req.session.error_msg = 'User not found.';
            return res.redirect('/login');
        }

        // Initialize session data
        res.locals.session = req.session || {};
        res.locals.session.isAuth = true; // Ensure session reflects logged-in state

        // Placeholder for referral rewards
        const referralRewards = []; // Replace with actual logic

        res.render('user/profile', {
            user: {
                userName: user.name,
                email: user.email,
                phone: user.phone || '',
                referralCode: user.referralCode || 'N/A',
                referralRewards,
            },
            error_msg: req.session.error_msg || '',
            success_msg: req.session.success_msg || '',
            session: res.locals.session,
        });

        // Clear flash messages
        delete req.session.error_msg;
        delete req.session.success_msg;
    } catch (err) {
        console.error('Error loading profile page:', err);
        res.locals.session = req.session || {};
        res.locals.session.isAuth = req.session.isAuth || false;
        res.render('user/profile', {
            user: null,
            error_msg: 'An unexpected error occurred.',
            success_msg: '',
            session: res.locals.session,
        });
    }
};

// Handle profile update
exports.updateProfile = [
    // Input validation using express-validator
    body('userName')
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('Name must be between 2 and 50 characters.')
        .matches(/^[a-zA-Z\s]+$/)
        .withMessage('Name can only contain letters and spaces.'),
    body('phone')
        .trim()
        .matches(/^\d{10}$/)
        .withMessage('Phone number must be exactly 10 digits.'),
    body('email')
        .trim()
        .isEmail()
        .withMessage('Please enter a valid email address.'),

    async (req, res) => {
        try {
            if (!req.user) {
                return res.json({
                    status: 'error',
                    message: 'Please log in to update your profile.',
                });
            }

            // Check for validation errors
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.json({
                    status: 'error',
                    message: errors.array()[0].msg,
                });
            }

            const { userName, phone, email } = req.body;
            const user = await User.findById(req.user.id);

            if (!user) {
                return res.json({
                    status: 'error',
                    message: 'User not found.',
                });
            }

            // Check if email is already in use by another user
            if (email !== user.email) {
                const existingEmail = await User.findOne({ email });
                if (existingEmail) {
                    return res.json({
                        status: 'error',
                        message: 'Email is already registered.',
                    });
                }

                // Store update data in session and send OTP for email verification
                req.session.profileUpdateData = {
                    userName,
                    phone,
                    email,
                };

                const otp = Math.floor(100000 + Math.random() * 900000).toString();
                await OTP.create({ email, otp });

                await transporter.sendMail({
                    to: email,
                    subject: 'Zeleena Fashions - OTP for Email Update',
                    html: `
                        <div style="font-family: Arial, sans-serif; padding: 20px;">
                            <h2>Zeleena Fashions</h2>
                            <p>Your OTP for email update verification is:</p>
                            <h3 style="color: #1D2951;">${otp}</h3>
                            <p>This OTP is valid for 2 minutes.</p>
                            <p>If you did not request this, please ignore this email.</p>
                        </div>
                    `,
                });

                return res.json({
                    status: 'verify',
                    message: 'OTP sent to your new email for verification.',
                });
            }

            // Update user data if email is unchanged
            user.name = userName;
            user.phone = phone;
            user.email = email;
            await user.save();

            return res.json({
                status: 'success',
                message: 'Profile updated successfully!',
            });
        } catch (err) {
            console.error('Profile update error:', err);
            return res.json({
                status: 'error',
                message: 'An unexpected error occurred.',
            });
        }
    },
];

// Render email verification page for profile update
exports.getVerifyEmailUpdate = async (req, res) => {
    try {
        if (!req.user || !req.session.profileUpdateData) {
            req.session.error_msg = 'Session expired. Please try updating your profile again.';
            return res.redirect('/profile');
        }

        res.locals.session = req.session || {};
        res.locals.session.isAuth = true;

        res.render('user/otp', {
            error_msg: req.session.error_msg || '',
            success_msg: 'Please enter the OTP sent to your new email.',
            session: res.locals.session,
        });

        delete req.session.error_msg;
        delete req.session.success_msg;
    } catch (err) {
        console.error('Error loading email verification page:', err);
        res.locals.session = req.session || {};
        res.locals.session.isAuth = req.session.isAuth || false;
        res.render('user/otp', {
            error_msg: 'An unexpected error occurred.',
            success_msg: '',
            session: res.locals.session,
        });
    }
};

// Handle OTP verification for email update
exports.verifyEmailOtp = async (req, res) => {
    try {
        const { otp } = req.body;

        if (!req.user || !req.session.profileUpdateData) {
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/otp', {
                error_msg: 'Session expired. Please try updating your profile again.',
                success_msg: '',
                session: res.locals.session,
            });
        }

        if (!otp) {
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/otp', {
                error_msg: 'OTP is required.',
                success_msg: '',
                session: res.locals.session,
            });
        }

        if (otp.length !== 6 || isNaN(otp)) {
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/otp', {
                error_msg: 'Please enter a valid 6-digit OTP.',
                success_msg: '',
                session: res.locals.session,
            });
        }

        const { userName, phone, email } = req.session.profileUpdateData;
        const otpRecord = await OTP.findOne({ email, otp });

        if (!otpRecord) {
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/otp', {
                error_msg: 'Invalid or expired OTP.',
                success_msg: '',
                session: res.locals.session,
            });
        }

        // Update user data
        const user = await User.findById(req.user.id);
        if (!user) {
            res.locals.session = req.session || {};
            res.locals.session.isAuth = req.session.isAuth || false;
            return res.render('user/otp', {
                error_msg: 'User not found.',
                success_msg: '',
                session: res.locals.session,
            });
        }

        user.name = userName;
        user.phone = phone;
        user.email = email;
        await user.save();

        delete req.session.profileUpdateData;

        req.session.success_msg = 'Profile updated successfully!';
        return res.redirect('/profile');
    } catch (err) {
        console.error('Email OTP verification error:', err);
        res.locals.session = req.session || {};
        res.locals.session.isAuth = req.session.isAuth || false;
        return res.render('user/otp', {
            error_msg: 'An unexpected error occurred.',
            success_msg: '',
            session: res.locals.session,
        });
    }
};