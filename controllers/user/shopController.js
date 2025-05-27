const mongoose = require('mongoose');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');
const Offer = require('../../models/offerSchema'); // Added Offer import

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
      return res.redirect('/shop?error=Product+not+found');
    }

    // Check if product is active
    if (!product.status) {
      console.log('Product is inactive:', productId);
      return res.redirect('/shop?error=Product+is+not+available');
    }

    // Get best offer for the product
    const productOffer = await getBestOffer(product);

    // Fetch related products with their offers
    const relatedProducts = await Product.find({
      category: product.category,
      _id: { $ne: productId },
      status: true,
    })
      .limit(4)
      .lean();

    // Attach best offer to related products
    for (let relatedProduct of relatedProducts) {
      const offer = await getBestOffer(relatedProduct);
      relatedProduct.offer = offer;
    }

    // Log image paths for debugging
    console.log('Product:', product.toObject());
    console.log('Product Image Paths:', product.productImage);
    console.log('Related Products:', relatedProducts);

    // Render the single product page
    res.render('user/singleproduct', {
      product: { ...product.toObject(), offer: productOffer },
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
    const search = req.query.search || '';
    const minPrice = parseFloat(req.query.minPrice) || 0;
    const maxPrice = parseFloat(req.query.maxPrice) || Infinity;

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

    const categories = await Category.find({ status: true, isDeleted:false, }).lean();
    
    // Build query
    let query = { status: true };
    
    // Add search functionality
    if (search && search.trim()) {
  query.productName = { $regex: search.trim(), $options: 'i' };
}

    
    // Add price range filter (based on final price after offers)
    query.price = { $gte: minPrice, $lte: maxPrice };

    const totalProducts = await Product.countDocuments(query);
    const products = await Product.find(query)
      .populate('category')
      .sort(sortOption)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // Attach best offer to each product
    for (let product of products) {
      const offer = await getBestOffer(product);
      product.offer = offer;
    }

    const totalPages = Math.ceil(totalProducts / limit);

    res.locals.session = req.session || {};
    res.locals.session.isAuth = req.session.isAuth || false;

    let userWishlist = [];
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

    res.render('user/shop', {
      categories,
      products,
      currentPage: page,
      totalPages,
      totalProducts,
      limit,
      sort,
      search,
      minPrice,
      maxPrice,
      offers,
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
      search: '',
      minPrice: 0,
      maxPrice: Infinity,
      offers: [],
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
    const search = req.query.search || '';
    const minPrice = parseFloat(req.query.minPrice) || 0;
    const maxPrice = parseFloat(req.query.maxPrice) || Infinity;

    const currentCategory = await Category.findById(categoryId).lean();
    if (!currentCategory || !currentCategory.status) {
      req.session.error_msg = 'Category not found or inactive.';
      return res.redirect('/shop');
    }

    const categories = await Category.find({ status: true ,isDeleted:false}).lean();
    
    // Build query
    let query = {
      category: categoryId,
      status: true,
      price: { $gte: minPrice, $lte: maxPrice }
    };
    
    if (search) {
      query.productName = { $regex: search, $options: 'i' };
    }

    const totalProducts = await Product.countDocuments(query);
    const products = await Product.find(query)
      .populate('category')
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // Attach best offer to each product
    for (let product of products) {
      const offer = await getBestOffer(product);
      product.offer = offer;
    }

    const totalPages = Math.ceil(totalProducts / limit);

    res.locals.session = req.session || {};
    res.locals.session.isAuth = req.session.isAuth || false;

    // Fetch active offers
    const currentDate = new Date();
    const offers = await Offer.find({
      status: true,
      startDate: { $lte: currentDate },
      endDate: { $gte: currentDate },
    }).lean();

    res.render('user/shopbyfilter', {
      categories,
      products,
      currentCategory,
      categoryId,
      currentPage: page,
      totalPages,
      totalProducts,
      limit,
      search,
      minPrice,
      maxPrice,
      offers,
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
      search: '',
      minPrice: 0,
      maxPrice: Infinity,
      offers: [],
      error_msg: 'An unexpected error occurred.',
      success_msg: '',
      session: res.locals.session,
    });
  }
};