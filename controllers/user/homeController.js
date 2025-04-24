const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');

// Render the homepage
exports.getHomePage = async (req, res) => {
    try {
        // Fetch categories (only active ones)
        const categories = await Category.find({ status: true }).lean();
        if (!categories.length) {
            console.log('No active categories found.');
        }

        // Fetch products (only active ones, limit to 10 for performance)
        const products = await Product.find({ status: true })
            .populate('category')
            .limit(10)
            .lean();
            console.log(products)
        if (!products.length) {
            console.log('No active products found.');
        }

        // Initialize session data
        res.locals.session = req.session || {};
        res.locals.session.isAuth = req.session.isAuth || false;

        // Initialize wishlist for unauthenticated users
        let userWishlist = [];

        // If user is authenticated, fetch their wishlist
        if (req.session.isAuth && req.user) {
            const user = await User.findById(req.user.id).lean();
            userWishlist = user.wishlist || [];
        }

        // Render the homepage with data
        res.render('user/home', {
            categories,
            products,
            error_msg: req.session.error_msg || '',
            success_msg: req.session.success_msg || '',
            session: res.locals.session,
            userWishlist, // Pass wishlist to template
        });

        // Clear flash messages
        delete req.session.error_msg;
        delete req.session.success_msg;
    } catch (err) {
        console.error('Error loading homepage:', err);
        res.locals.session = req.session || {};
        res.locals.session.isAuth = req.session.isAuth || false;
        res.render('user/home', {
            categories: [],
            products: [],
            error_msg: 'An unexpected error occurred.',
            success_msg: '',
            session: res.locals.session,
            userWishlist: [],
        });
    }
};