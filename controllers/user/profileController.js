const { body, validationResult } = require('express-validator');
const User = require('../../models/userSchema');
const Wallet = require('../../models/walletSchema');

// Render the profile page
exports.getProfile = async (req, res) => {
    try {
        // Check if user session exists and has an ID
        if (!req.session || !req.session.user || !req.session.user.id) {
            req.session.error_msg = 'Please log in to view your profile.';
            return res.redirect('/login');
        }

        const userId = req.session.user.id;
        const user = await User.findById(userId).lean();
        if (!user) {
            req.session.error_msg = 'User not found.';
            return res.redirect('/login');
        }

        // Set session data for template
        res.locals.session = req.session || {};
        res.locals.session.isAuth = req.session.user ? req.session.user.isAuth : false;

        const referralRewards = []; // Replace with actual logic

        res.render('user/profile', {
            user: {
                userName: user.name || 'Guest', // Fallback in case name is missing
                email: user.email || 'Not provided', // Fallback for email
                phone: user.phone || 'Not provided',
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
        res.locals.session.isAuth = req.session.user ? req.session.user.isAuth : false;
        res.render('user/profile', {
            user: {
                userName: 'Guest',
                email: 'Not provided',
                phone: 'Not provided',
                referralCode: 'N/A',
                referralRewards: [],
            },
            error_msg: 'An unexpected error occurred.',
            success_msg: '',
            session: res.locals.session,
        });
    }
};

// Handle profile update
exports.updateProfile = [
    // Input validation for userName
    body('userName')
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('Name must be between 2 and 50 characters.')
        .matches(/^[a-zA-Z][a-zA-Z\s]*$/)
        .withMessage('Name must start with a letter and contain only letters and spaces.'),

    // Input validation for phone
    body('phone')
        .trim()
        .matches(/^[6-9]\d{9}$/)
        .withMessage('Phone number must be exactly 10 digits and start with 6, 7, 8, or 9.')
        .custom((value) => {
            // Check for repeated digits (e.g., "6666666666")
            const uniqueDigits = new Set(value.split(''));
            if (uniqueDigits.size < 5) {
                throw new Error('Phone number contains too many repeated digits.');
            }
            return true;
        }),

    // No validation for email as it should not be editable
    async (req, res) => {
        try {
            // Check if user session exists
            if (!req.session || !req.session.user || !req.session.user.id) {
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

            // Extract validated fields from request body
            const { userName, phone } = req.body;

            // Find the user by ID
            const user = await User.findById(req.session.user.id);
            if (!user) {
                return res.json({
                    status: 'error',
                    message: 'User not found.',
                });
            }

            // Check if data has changed
            if (user.name === userName && user.phone === phone) {
                return res.json({
                    status: 'success',
                    message: 'No changes made to profile.',
                });
            }

            // Update user data (email is not updated)
            user.name = userName;
            user.phone = phone;
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

// Fetch wallet history
exports.getWalletHistory = async (req, res) => {
    try {
        if (!req.session || !req.session.user || !req.session.user.id) {
            console.log('No user found, redirecting to login');
            return res.redirect('/login');
        }

        const user = await User.findById(req.session.user.id).lean();
        if (!user) {
            console.log('No user found for ID:', req.session.user.id);
            return res.redirect('/login');
        }

        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const wallet = await Wallet.findOne({ userId: req.session.user.id })
            .populate('transaction.orderId');

        console.log('Fetched wallet:', wallet);

        if (!wallet) {
            console.log('No wallet found for user:', req.session.user.id);
            return res.render('user/walletHistory', {
                user: { userName: user.name, walletCardNumber: '1234' },
                wallet: { balance: 0, transaction: [] },
                currentPage: 1,
                totalPages: 1,
                hasPrevPage: false,
                hasNextPage: false,
            });
        }

        const transactions = Array.isArray(wallet.transaction) ? wallet.transaction : [];
        transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        const totalTransactions = transactions.length;
        const totalPages = Math.ceil(totalTransactions / limit) || 1;
        const paginatedTransactions = transactions.slice(skip, skip + limit);

        res.render('user/walletHistory', {
            user: { userName: user.name, walletCardNumber: '1234' },
            wallet: {
                balance: wallet.balance,
                transaction: paginatedTransactions,
            },
            currentPage: page,
            totalPages,
            hasPrevPage: page > 1,
            hasNextPage: page < totalPages,
        });
    } catch (error) {
        console.error('Error fetching wallet history:', error);
        res.status(500).render('error', { message: 'Server Error' });
    }
};