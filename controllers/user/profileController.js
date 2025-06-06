const { body, validationResult } = require('express-validator');
const User = require('../../models/userSchema');
const Wallet = require('../../models/walletSchema');

// Render the profile page
exports.getProfile = async (req, res) => {
    try {
       const userId = req. req.session.userId 
        console.log(userId,"UserDetails")
        if (!req.userId) {
            req.session.error_msg = 'Please log in to view your profile.';
            return res.redirect('/login');
        }

        const user = await User.findById(userId).lean();
        if (!user) {
            req.session.error_msg = 'User not found.';
            return res.redirect('/login');
        }

        res.locals.session = req.session || {};
        res.locals.session.isAuth = true;
        
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
            // Check if user is logged in
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

            // Extract validated fields from request body
            const { userName, phone } = req.body;

            // Find the user by ID
            const user = await User.findById(req.user.id);
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
            console.error('Profile updaterror:', err);
            return res.json({
                status: 'error',
                message: 'An unexpected error occurred.',
            });
        }
    },
];

// Removed getVerifyEmailUpdate and verifyEmailOtp since email updates are not allowed

// Fetch wallet history
exports.getWalletHistory = async (req, res) => {
    try {
        if (!req.user) {
            console.log('No user found, redirecting to login');
            return res.redirect('/login');
        }

        const user = await User.findById(req.user.id).lean();
        if (!user) {
            console.log('No user found for ID:', req.user.id);
            return res.redirect('/login');
        }

        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const wallet = await Wallet.findOne({ userId: req.user.id })
            .populate('transaction.orderId');

        console.log('Fetched wallet:', wallet);

        if (!wallet) {
            console.log('No wallet found for user:', req.user.id);
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
