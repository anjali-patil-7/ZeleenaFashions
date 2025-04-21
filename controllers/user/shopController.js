const mongoose = require('mongoose');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');

exports.getSingleProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    console.log('Request URL:', req.url);
    console.log('Request Params:', req.params);
    console.log('Product ID:', productId);

    // Validate ObjectId
    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      console.log('Invalid product ID:', productId);
      return res.redirect('/shop?error=Invalid+product+ID');
    }

    // Fetch the product by ID
    const product = await Product.findById(productId).populate('category');
    if (!product) {
      console.log('Product not found for ID:', productId);
      return res.redirect('/shop?error=Product+not+found');
    }

    // Check if product is active
    if (!product.status) {
      console.log('Product is inactive:', productId);
      return res.redirect('/shop?error=Product+is+not+available');
    }

    // Fetch related products
    const relatedProducts = await Product.find({
      category: product.category,
      _id: { $ne: productId },
      status: true,
    })
      .limit(4)
      .lean();

    // Log image paths for debugging
    console.log('Product:', product.toObject());
    console.log('Product Image Paths:', product.productImage);
    console.log('Related Products:', relatedProducts);

    // Render the single product page
    res.render('user/singleproduct', {
      product: product.toObject(),
      relatedProduct: relatedProducts,
    });
  } catch (error) {
    console.error('Error fetching single product:', error);
    res.redirect('/shop?error=Something+went+wrong');
  }
};

exports.getShopPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 9;
    const sort = req.query.sort || '';

    let sortOption = {};
    switch (sort) {
      case 'a-z':
        sortOption = { productName: 1 };
        break;
      case 'z-a':
        sortOption = { productName: -1 };
        break;
      case 'l-h':
        sortOption = { price: 1 };
        break;
      case 'h-l':
        sortOption = { price: -1 };
        break;
      default:
        sortOption = { createdAt: -1 };
    }

    const categories = await Category.find({ status: true }).lean();
    const totalProducts = await Product.countDocuments({ status: true });
    const products = await Product.find({ status: true })
      .populate('category')
      .sort(sortOption)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const totalPages = Math.ceil(totalProducts / limit);

    res.locals.session = req.session || {};
    res.locals.session.isAuth = req.session.isAuth || false;

    let userWishlist = [];
    if (req.session.isAuth && req.user) {
      const user = await User.findById(req.user.id).lean();
      userWishlist = user.wishlist || [];
    }

    // Placeholder for offers (replace with actual offer fetching logic if available)
    const offers = []; // Replace with actual offers from your Offer model if needed

    res.render('user/shop', {
      categories,
      products,
      currentPage: page,
      totalPages,
      totalProducts,
      limit,
      sort,
      offers, // Pass offers array (empty or populated)
      error_msg: req.session.error_msg || '',
      success_msg: req.session.success_msg || '',
      session: res.locals.session,
      userWishlist,
    });

    delete req.session.error_msg;
    delete req.session.success_msg;
  } catch (err) {
    console.error('Error loading shop page:', err);
    res.locals.session = req.session || {};
    res.locals.session.isAuth = req.session.isAuth || false;
    res.render('user/shop', {
      categories: [],
      products: [],
      currentPage: 1,
      totalPages: 1,
      totalProducts: 0,
      limit: 9,
      sort: '',
      offers: [], // Pass empty offers array in error case
      error_msg: 'An unexpected error occurred.',
      success_msg: '',
      session: res.locals.session,
      userWishlist: [],
    });
  }
};

exports.getShopByFilter = async (req, res) => {
  try {
    const categoryId = req.params.categoryId;
    const page = parseInt(req.query.page) || 1;
    const limit = 9;

    const currentCategory = await Category.findById(categoryId).lean();
    if (!currentCategory || !currentCategory.status) {
      req.session.error_msg = 'Category not found or inactive.';
      return res.redirect('/shop');
    }

    const categories = await Category.find({ status: true }).lean();
    const totalProducts = await Product.countDocuments({
      category: categoryId,
      status: true,
    });
    const products = await Product.find({
      category: categoryId,
      status: true,
    })
      .populate('category')
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const totalPages = Math.ceil(totalProducts / limit);

    res.locals.session = req.session || {};
    res.locals.session.isAuth = req.session.isAuth || false;

    // Placeholder for offers (replace with actual offer fetching logic if available)
    const offers = []; // Replace with actual offers if needed

    res.render('user/shopbyfilter', {
      categories,
      products,
      currentCategory,
      categoryId,
      currentPage: page,
      totalPages,
      totalProducts,
      limit,
      offers, // Pass offers array
      error_msg: req.session.error_msg || '',
      success_msg: req.session.success_msg || '',
      session: res.locals.session,
    });

    delete req.session.error_msg;
    delete req.session.success_msg;
  } catch (err) {
    console.error('Error loading shop by filter page:', err);
    res.locals.session = req.session || {};
    res.locals.session.isAuth = req.session.isAuth || false;
    res.render('user/shopbyfilter', {
      categories: [],
      products: [],
      currentCategory: {},
      categoryId: '',
      currentPage: 1,
      totalPages: 1,
      totalProducts: 0,
      limit: 9,
      offers: [], // Pass empty offers array
      error_msg: 'An unexpected error occurred.',
      success_msg: '',
      session: res.locals.session,
    });
  }
};