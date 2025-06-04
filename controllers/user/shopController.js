const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');
const Offer = require('../../models/offerSchema');

async function getBestOffer(product) {
    try {
        const currentDate = new Date();
        const offers = await Offer.find({
            status: true,
            startDate: { $lte: currentDate },
            endDate: { $gte: currentDate },
            $or: [
                { applicableTo: 'all' },
                { applicableTo: 'category', category: product.category },
                { applicableTo: 'product', product: product._id }
            ]
        }).lean();

        let bestOffer = null;
        let maxDiscount = 0;

        for (const offer of offers) {
            let discount = 0;
            if (offer.offerType === 'percentage') {
                discount = (product.price * offer.discount) / 100;
            } else if (offer.offerType === 'fixed') {
                discount = offer.discount;
            }

            if (discount > maxDiscount) {
                maxDiscount = discount;
                bestOffer = {
                    discount: offer.discount,
                    offerType: offer.offerType,
                    finalPrice: product.price - discount
                };
            }
        }

        return bestOffer;
    } catch (err) {
        console.error('Error fetching best offer:', err);
        return null;
    }
}

exports.getShopPage = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 9;
        const search = req.query.search || '';
        const minPrice = parseFloat(req.query.minPrice) || 0;
        const maxPrice = parseFloat(req.query.maxPrice) || Infinity;
        const sort = req.query.sort || '';

        const categories = await Category.find({ status: true, isDeleted: false }).lean();

        let query = {
            status: true,
            price: { $gte: minPrice, $lte: maxPrice }
        };

        if (search) {
            query.productName = { $regex: search, $options: 'i' };
        }

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

        const totalProducts = await Product.countDocuments(query);
        const products = await Product.find(query)
            .populate('category')
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

        const userWishlist = req.session.user ? req.session.user.wishlist || [] : [];

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
            search,
            minPrice,
            maxPrice,
            offers,
            error_msg: req.session.error_msg || '',
            success_msg: req.session.success_msg || '',
            session: res.locals.session,
            userWishlist,
            sort
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
            search: '',
            minPrice: 0,
            maxPrice: Infinity,
            offers: [],
            error_msg: 'An unexpected error occurred.',
            success_msg: '',
            session: res.locals.session,
            userWishlist: [],
            sort: ''
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
        const sort = req.query.sort || '';

        const currentCategory = await Category.findById(categoryId).lean();
        if (!currentCategory || !currentCategory.status) {
            req.session.error_msg = 'Category not found or inactive.';
            return res.redirect('/shop');
        }

        const categories = await Category.find({ status: true, isDeleted: false }).lean();

        let query = {
            category: categoryId,
            status: true,
            price: { $gte: minPrice, $lte: maxPrice }
        };

        if (search) {
            query.productName = { $regex: search, $options: 'i' };
        }

        let sortCriteria = {};
        switch (sort) {
            case 'a-z':
                sortCriteria = { productName: 1 };
                break;
            case 'z-a':
                sortCriteria = { productName: -1 };
                break;
            case 'l-h':
                sortCriteria = { price: 1 };
                break;
            case 'h-l':
                sortCriteria = { price: -1 };
                break;
            default:
                sortCriteria = { createdAt: -1 };
        }

        const totalProducts = await Product.countDocuments(query);
        const products = await Product.find(query)
            .populate('category')
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

        const userWishlist = req.session.user ? req.session.user.wishlist || [] : [];

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
            userWishlist,
            sortOption: sort
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
            userWishlist: [],
            sortOption: ''
        });
    }
};


exports.getSingleProduct = async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await Product.findById(productId)
            .populate('category')
            .lean();

        if (!product || !product.status) {
            req.session.error_msg = 'Product not found or inactive.';
            return res.redirect('/shop');
        }

        const offer = await getBestOffer(product);
        product.offer = offer;

        // Fetch related products (e.g., same category, exclude current product)
        const relatedProducts = await Product.find({
            category: product.category,
            _id: { $ne: productId },
            status: true
        })
            .limit(4)
            .lean();

        for (let related of relatedProducts) {
            const relatedOffer = await getBestOffer(related);
            related.offer = relatedOffer;
        }

        res.locals.session = req.session || {};
        res.locals.session.isAuth = req.session.isAuth || false;

        console.log("session details: ",req.session)
        const userWishlist = req.session.user ? req.session.user.wishlist || [] : [];

        const currentDate = new Date();
        const offers = await Offer.find({
            status: true,
            startDate: { $lte: currentDate },
            endDate: { $gte: currentDate },
        }).lean();

        res.render('user/singleproduct', {
            product,
            relatedProducts, // Changed from relatedProduct to relatedProducts for consistency
            error_msg: req.session.error_msg || '',
            success_msg: req.session.success_msg || '',
            session: res.locals.session,
            userWishlist,
            offers
        });

        delete req.session.error_msg;
        delete req.session.success_msg;
    } catch (err) {
        console.error('Error loading single product page:', err);
        res.locals.session = req.session || {};
        res.locals.session.isAuth = req.session.isAuth || false;
        res.render('user/singleproduct', {
            product: null,
            relatedProducts: [],
            error_msg: 'An unexpected error occurred.',
            success_msg: '',
            session: res.locals.session,
            userWishlist: [],
            offers: []
        });
    }
};