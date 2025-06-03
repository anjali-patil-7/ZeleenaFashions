const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Offer = require('../../models/offerSchema');

// Helper function to get the best offer for a product
const getBestOffer = async (product) => {
  const currentDate = new Date();
  // Fetch product-specific offers
  const productOffers = await Offer.find({
    offerType: 'product',
    productId: product._id,
    status: true,
    startDate: { $lte: currentDate },
    endDate: { $gte: currentDate },
  }).lean();

  // Fetch category-specific offers
  const categoryOffers = await Offer.find({
    offerType: 'category',
    categoryId: product.category,
    status: true,
    startDate: { $lte: currentDate },
    endDate: { $gte: currentDate },
  }).lean();

  // Combine and find the best offer
  const allOffers = [...productOffers, ...categoryOffers];
  if (allOffers.length === 0) return { discount: 0, finalPrice: product.price };

  const bestOffer = allOffers.reduce((max, offer) => 
    offer.discount > max.discount ? offer : max, { discount: 0 });

  const discountAmount = (product.price * bestOffer.discount) / 100;
  const finalPrice = product.price - discountAmount;

  return {
    discount: bestOffer.discount,
    discountAmount,
    finalPrice,
    offerName: bestOffer.offerName,
  };
};

// Render the homepage
exports.getHomePage = async (req, res) => {
    try {
      console.log("User Details>>>>>", req.session)
        // Fetch categories (only active ones)
        const categories = await Category.find({ status: true ,isDeleted: false }).lean();
        if (!categories.length) {
            console.log('No active categories found.');
        }

        // Fetch products (only active ones, sorted by createdAt, increased limit to 20)
        const products = await Product.find({ status: true })
            .populate('category')
            .sort({ createdAt: -1 }) // Sort by createdAt in descending order (newest first)
            .limit(20) // Increased limit to ensure new products are included
            .lean();
        console.log(products);
        if (!products.length) {
            console.log('No active products found.');
        }

        // Attach best offer to each product
        for (let product of products) {
          const offer = await getBestOffer(product);
          product.offer = offer;
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

        // Fetch active offers
        const currentDate = new Date();
        const offers = await Offer.find({
          status: true,
          startDate: { $lte: currentDate },
          endDate: { $gte: currentDate },
        }).lean();

        // Render the homepage with data
        res.render('user/home', {
            categories,
            products,
            offers,
            error_msg: req.session.error_msg || '',
            success_msg: req.session.success_msg || '',
            session: res.locals.session,
            userWishlist,
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
            offers: [],
            error_msg: 'An unexpected error occurred.',
            success_msg: '',
            session: res.locals.session,
            userWishlist: [],
        });
    }
};

//about us
exports.getAboutPage = (req, res) => {
  res.render('user/about', { pageTitle: 'About Us' });
};

exports.getContactPage = (req, res) => {
  res.render('user/contact', { pageTitle: 'Contact Us' });
};

