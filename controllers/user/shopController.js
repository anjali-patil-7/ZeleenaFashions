const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const Offer = require("../../models/offerSchema");

const getBestOffer = async (product) => {
  try {
    const currentDate = new Date();

    // Fetch product-specific offers
    const productOffers = await Offer.find({
      offerType: "product", // Use 'offerType' per schema
      productId: product._id, // Use 'productId' and check if _id is in the array
      status: true,
      startDate: { $lte: currentDate },
      endDate: { $gte: currentDate },
    }).lean();

    // Fetch category-specific offers
    const categoryOffers = await Offer.find({
      offerType: "category", // Use 'offerType' per schema
      categoryId: product.category?._id, // Use 'categoryId' and check if category _id is in the array
      status: true,
      startDate: { $lte: currentDate },
      endDate: { $gte: currentDate },
    }).lean();

    // Combine all offers
    const combinedOffers = [...productOffers, ...categoryOffers];
    console.log(
      `Offers for product ${product.productName} (${product._id}):`,
      combinedOffers
    );

    // If no offers, return default
    if (combinedOffers.length === 0) {
      console.log(`No offers found for product ${product.productName}`);
      return {
        discount: 0,
        finalPrice: product.price,
        discountAmount: 0,
        offerName: "",
      };
    }

    // Find the best offer based on discount amount
    const bestOffer = combinedOffers.reduce(
      (max, offer) => {
        const discountAmount =
          offer.offerType === "percentage"
            ? (product.price * offer.discount) / 100
            : offer.discount; // Handle fixed discounts
        const currentMaxDiscount =
          max.offerType === "percentage"
            ? (product.price * max.discount) / 100
            : max.discount;
        return discountAmount > currentMaxDiscount ? offer : max;
      },
      { discount: 0, offerType: "percentage" }
    ); // Initial value for comparison

    // Calculate discount amount and final price
    const discountAmount =
      bestOffer.offerType === "percentage"
        ? (product.price * bestOffer.discount) / 100
        : bestOffer.discount;
    const finalPrice = product.price - discountAmount;

    console.log(`Best offer for product ${product.productName}:`, bestOffer);

    return {
      discount: bestOffer.discount,
      discountAmount,
      finalPrice,
      offerName: bestOffer.offerName || "",
      offerType: bestOffer.offerType, // Include for clarity
    };
  } catch (err) {
    console.error("Error fetching best offer for product", product._id, err);
    return {
      discount: 0,
      finalPrice: product.price,
      discountAmount: 0,
      offerName: "",
    };
  }
};

exports.getShopPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 9;
    const search = req.query.search || "";
    const minPrice = parseFloat(req.query.minPrice) || 0;
    const maxPrice = parseFloat(req.query.maxPrice) || Infinity;
    const sort = req.query.sort || "";

    const categories = await Category.find({
      status: true,
      isDeleted: false,
    }).lean();

    let query = {
      status: true,
      price: { $gte: minPrice, $lte: maxPrice },
    };

    if (search) {
      query.productName = { $regex: search, $options: "i" };
    }

    let sortOption = {};
    switch (sort) {
      case "a-z":
        sortOption = { productName: 1 };
        break;
      case "z-a":
        sortOption = { productName: -1 };
        break;
      case "l-h":
        sortOption = { price: 1 };
        break;
      case "h-l":
        sortOption = { price: -1 };
        break;
      default:
        sortOption = { createdAt: -1 };
    }

    const totalProducts = await Product.countDocuments(query);
    const products = await Product.find(query)
      .populate("category")
      .sort(sortOption)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    for (let product of products) {
      const offer = await getBestOffer(product);
      product.offer = offer;
    }

    const totalPages = Math.ceil(totalProducts / limit);

    res.locals.session = req.session || {};
    res.locals.session.isAuth = req.session.isAuth || false;

    const userWishlist = req.session.user
      ? req.session.user.wishlist || []
      : [];

    const currentDate = new Date();
    const offers = await Offer.find({
      status: true,
      startDate: { $lte: currentDate },
      endDate: { $gte: currentDate },
    }).lean();
    console.log("offerdeatils>>", offers);

    res.render("user/shop", {
      categories,
      products,
      currentPage: page,
      totalPages,
      totalProducts,
      limit,
      search,
      minPrice,
      maxPrice,
      offers,
      error_msg: req.session.error_msg || "",
      success_msg: req.session.success_msg || "",
      session: res.locals.session,
      userWishlist,
      sort,
    });

    delete req.session.error_msg;
    delete req.session.success_msg;
  } catch (err) {
    console.error("Error loading shop page:", err);
    res.locals.session = req.session || {};
    res.locals.session.isAuth = req.session.isAuth || false;
    res.render("user/shop", {
      categories: [],
      products: [],
      currentPage: 1,
      totalPages: 1,
      totalProducts: 0,
      limit: 9,
      search: "",
      minPrice: 0,
      maxPrice: Infinity,
      offers: [],
      error_msg: "An unexpected error occurred.",
      success_msg: "",
      session: res.locals.session,
      userWishlist: [],
      sort: "",
    });
  }
};

// The rest of the file (getShopByFilter, getSingleProduct) remains mostly the same, but update getBestOffer calls
exports.getShopByFilter = async (req, res) => {
  try {
    const categoryId = req.params.categoryId;
    const page = parseInt(req.query.page) || 1;
    const limit = 9;
    const search = req.query.search || "";
    const minPrice = parseFloat(req.query.minPrice) || 0;
    const maxPrice = parseFloat(req.query.maxPrice) || Infinity;
    const sort = req.query.sort || "";

    const currentCategory = await Category.findById(categoryId).lean();
    if (!currentCategory || !currentCategory.status) {
      req.session.error_msg = "Category not found or inactive.";
      return res.redirect("/shop");
    }

    const categories = await Category.find({
      status: true,
      isDeleted: false,
    }).lean();

    let query = {
      category: categoryId,
      status: true,
      price: { $gte: minPrice, $lte: maxPrice },
    };

    if (search) {
      query.productName = { $regex: search, $options: "i" };
    }

    let sortCriteria = {};
    switch (sort) {
      case "a-z":
        sortCriteria = { productName: 1 };
        break;
      case "z-a":
        sortCriteria = { productName: -1 };
        break;
      case "l-h":
        sortCriteria = { price: 1 };
        break;
      case "h-l":
        sortCriteria = { price: -1 };
        break;
      default:
        sortCriteria = { createdAt: -1 };
    }

    const totalProducts = await Product.countDocuments(query);
    const products = await Product.find(query)
      .populate("category")
      .sort(sortCriteria)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    for (let product of products) {
      const offer = await getBestOffer(product);
      product.offer = offer;
    }

    const totalPages = Math.ceil(totalProducts / limit);

    res.locals.session = req.session || {};
    res.locals.session.isAuth = req.session.isAuth || false;

    const userWishlist = req.session.user
      ? req.session.user.wishlist || []
      : [];

    const currentDate = new Date();
    const offers = await Offer.find({
      status: true,
      startDate: { $lte: currentDate },
      endDate: { $gte: currentDate },
    }).lean();

    res.render("user/shopbyfilter", {
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
      error_msg: req.session.error_msg || "",
      success_msg: req.session.success_msg || "",
      session: res.locals.session,
      userWishlist,
      sortOption: sort,
    });

    delete req.session.error_msg;
    delete req.session.success_msg;
  } catch (err) {
    console.error("Error loading shop by filter page:", err);
    res.locals.session = req.session || {};
    res.locals.session.isAuth = req.session.isAuth || false;
    res.render("user/shopbyfilter", {
      categories: [],
      products: [],
      currentCategory: {},
      categoryId: "",
      currentPage: 1,
      totalPages: 1,
      totalProducts: 0,
      limit: 9,
      search: "",
      minPrice: 0,
      maxPrice: Infinity,
      offers: [],
      error_msg: "An unexpected error occurred.",
      success_msg: "",
      session: res.locals.session,
      userWishlist: [],
      sortOption: "",
    });
  }
};

exports.getSingleProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findById(productId)
      .populate("category")
      .lean();

    if (!product || !product.status) {
      req.session.error_msg = "Product not found or inactive.";
      return res.redirect("/shop");
    }

    const offer = await getBestOffer(product);
    product.offer = offer;

    // Fetch related products (e.g., same category, exclude current product)
    const relatedProducts = await Product.find({
      category: product.category,
      _id: { $ne: productId },
      status: true,
    })
      .limit(4)
      .lean();

    for (let related of relatedProducts) {
      const relatedOffer = await getBestOffer(related);
      related.offer = relatedOffer;
    }

    res.locals.session = req.session || {};
    res.locals.session.isAuth = req.session.isAuth || false;

    console.log("session details: ", req.session);
    const userWishlist = req.session.user
      ? req.session.user.wishlist || []
      : [];

    const currentDate = new Date();
    const offers = await Offer.find({
      status: true,
      startDate: { $lte: currentDate },
      endDate: { $gte: currentDate },
    }).lean();

    res.render("user/singleproduct", {
      product,
      relatedProducts,
      error_msg: req.session.error_msg || "",
      success_msg: req.session.success_msg || "",
      session: res.locals.session,
      userWishlist,
      offers,
    });

    delete req.session.error_msg;
    delete req.session.success_msg;
  } catch (err) {
    console.error("Error loading single product page:", err);
    res.locals.session = req.session || {};
    res.locals.session.isAuth = req.session.isAuth || false;
    res.render("user/singleproduct", {
      product: null,
      relatedProducts: [],
      error_msg: "An unexpected error occurred.",
      success_msg: "",
      session: res.locals.session,
      userWishlist: [],
      offers: [],
    });
  }
};
