const mongoose = require('mongoose');
const Offer = require('../../models/offerSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');

// List all offers with pagination and search
exports.getOfferList = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;
        const searchQuery = req.query.query || '';

        console.log('Search Query:', searchQuery);

        const query = searchQuery 
            ? { offerName: { $regex: searchQuery, $options: 'i' } }
            : {};

        console.log('MongoDB Query:', query);

        const totalOffers = await Offer.countDocuments(query);
        console.log('Total Offers:', totalOffers);

        const offers = await Offer.find(query)
            .populate('productId', 'productName')
            .populate('categoryId', 'name')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        console.log('Offers:', offers);

        res.render('admin/offer', {
            offers,
            currentPage: page,
            totalPages: Math.ceil(totalOffers / limit),
            searchQuery
        });
    } catch (error) {
        console.error('Error in getOfferList:', error);
        req.flash('error', 'Error loading offer list');
        res.redirect('/admin/offer');
    }
};

// Render add offer form
exports.getAddOffer = async (req, res) => {
    try {
        const products = await Product.find({ status: true });
        const categories = await Category.find({ status: true });
        
        res.render('admin/addoffer', {
            products,
            categories,
            error: req.flash('error')
        });
    } catch (error) {
        console.error('Error in getAddOffer:', error);
        req.flash('error', 'Error loading add offer form');
        res.redirect('/admin/offer');
    }
};

// Handle add offer submission
exports.postAddOffer = async (req, res) => {
    try {
        const {
            offerName,
            discount,
            startDate,
            endDate,
            offerType,
            productId,
            categoryId
        } = req.body;

        // Input validation
        if (!offerName || offerName.length < 3 || offerName.length > 50) {
            req.flash('error', 'Offer name must be 3-50 characters long');
            return res.redirect('/admin/addoffer');
        }

        const discountValue = parseFloat(discount);
        if (isNaN(discountValue) || discountValue < 1 || discountValue > 100) {
            req.flash('error', 'Discount must be between 1-100%');
            return res.redirect('/admin/addoffer');
        }

        const now = new Date();
        const start = new Date(startDate);
        const end = new Date(endDate);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            req.flash('error', 'Invalid date format');
            return res.redirect('/admin/addoffer');
        }

        if (start < now) {
            req.flash('error', 'Start date cannot be in the past');
            return res.redirect('/admin/addoffer');
        }

        const minDurationHours = 1;
        const minDurationMs = minDurationHours * 60 * 60 * 1000;
        if (end <= start) {
            req.flash('error', 'End date must be after start date');
            return res.redirect('/admin/addoffer');
        }
        if ((end - start) < minDurationMs) {
            req.flash('error', `End date must be at least ${minDurationHours} hour(s) after start date`);
            return res.redirect('/admin/addoffer');
        }

        if (!['product', 'category'].includes(offerType)) {
            req.flash('error', 'Invalid offer type');
            return res.redirect('/admin/addoffer');
        }

        // Validate productIds or categoryIds based on offerType
        let validatedProductIds = [];
        let validatedCategoryIds = [];

        if (offerType === 'product') {
            const productIds = Array.isArray(productId) ? productId : (productId ? [productId] : []);
            if (productIds.length === 0) {
                req.flash('error', 'At least one product must be selected');
                return res.redirect('/admin/addoffer');
            }
            validatedProductIds = await Product.find({ 
                _id: { $in: productIds.filter(id => mongoose.Types.ObjectId.isValid(id)) },
                status: true 
            }).select('_id');
            if (validatedProductIds.length !== productIds.length) {
                req.flash('error', 'One or more selected products are invalid or inactive');
                return res.redirect('/admin/addoffer');
            }
        } else if (offerType === 'category') {
            const categoryIds = Array.isArray(categoryId) ? categoryId : (categoryId ? [categoryId] : []);
            if (categoryIds.length === 0) {
                req.flash('error', 'At least one category must be selected');
                return res.redirect('/admin/addoffer');
            }
            validatedCategoryIds = await Category.find({ 
                _id: { $in: categoryIds.filter(id => mongoose.Types.ObjectId.isValid(id)) },
                status: true 
            }).select('_id');
            if (validatedCategoryIds.length !== categoryIds.length) {
                req.flash('error', 'One or more selected categories are invalid or inactive');
                return res.redirect('/admin/addoffer');
            }
        }

        // Create new offer
        const newOffer = new Offer({
            offerName,
            discount: discountValue,
            startDate: start,
            endDate: end,
            offerType,
            productId: offerType === 'product' ? validatedProductIds.map(id => id._id) : [],
            categoryId: offerType === 'category' ? validatedCategoryIds.map(id => id._id) : [],
            status: true
        });

        await newOffer.save();
        req.flash('success', 'Offer created successfully');
        res.redirect('/admin/offer');

    } catch (error) {
        console.error('Error creating offer:', error);
        req.flash('error', 'Failed to create offer. Please try again.');
        res.redirect('/admin/addoffer');
    }
};

// Render edit offer form
exports.getEditOffer = async (req, res) => {
    try {
        const offerId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(offerId)) {
            req.flash('error', 'Invalid offer ID');
            return res.redirect('/admin/offer');
        }

        const offer = await Offer.findById(offerId)
            .populate('productId', 'productName')
            .populate('categoryId', 'name');

        if (!offer) {
            req.flash('error', 'Offer not found');
            return res.redirect('/admin/offer');
        }

        const products = await Product.find({ status: true });
        const categories = await Category.find({ status: true });

        res.render('admin/editoffer', {
            offer,
            products,
            categories,
            error: req.flash('error')
        });
    } catch (error) {
        console.error('Error in getEditOffer:', error);
        req.flash('error', 'Error loading edit offer form');
        res.redirect('/admin/offer');
    }
};

// Handle edit offer submission
exports.postEditOffer = async (req, res) => {
    try {
        const offerId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(offerId)) {
            req.flash('error', 'Invalid offer ID');
            return res.redirect('/admin/offer');
        }

        const {
            offerName,
            discount,
            startDate,
            endDate,
            offerType,
            productId,
            categoryId
        } = req.body;

        // Validation
        if (!offerName || offerName.length < 3 || offerName.length > 50) {
            req.flash('error', 'Offer name must be 3-50 characters long');
            return res.redirect(`/admin/editoffer/${offerId}`);
        }

        const discountValue = parseFloat(discount);
        if (isNaN(discountValue) || discountValue < 1 || discountValue > 100) {
            req.flash('error', 'Discount must be between 1-100%');
            return res.redirect(`/admin/editoffer/${offerId}`);
        }

        const now = new Date();
        const start = new Date(startDate);
        const end = new Date(endDate);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            req.flash('error', 'Invalid date format');
            return res.redirect(`/admin/editoffer/${offerId}`);
        }

        if (start < now) {
            req.flash('error', 'Start date cannot be in the past');
            return res.redirect(`/admin/editoffer/${offerId}`);
        }

        const minDurationHours = 1;
        const minDurationMs = minDurationHours * 60 * 60 * 1000;
        if (end <= start) {
            req.flash('error', 'End date must be after start date');
            return res.redirect(`/admin/editoffer/${offerId}`);
        }
        if ((end - start) < minDurationMs) {
            req.flash('error', `End date must be at least ${minDurationHours} hour(s) after start date`);
            return res.redirect(`/admin/editoffer/${offerId}`);
        }

        if (!['product', 'category'].includes(offerType)) {
            req.flash('error', 'Invalid offer type');
            return res.redirect(`/admin/editoffer/${offerId}`);
        }

        // Validate productIds or categoryIds based on offerType
        let validatedProductIds = [];
        let validatedCategoryIds = [];

        if (offerType === 'product') {
            const productIds = Array.isArray(productId) ? productId : (productId ? [productId] : []);
            if (productIds.length === 0) {
                req.flash('error', 'At least one product must be selected');
                return res.redirect(`/admin/editoffer/${offerId}`);
            }
            validatedProductIds = await Product.find({ 
                _id: { $in: productIds.filter(id => mongoose.Types.ObjectId.isValid(id)) },
                status: true 
            }).select('_id');
            if (validatedProductIds.length !== productIds.length) {
                req.flash('error', 'One or more selected products are invalid or inactive');
                return res.redirect(`/admin/editoffer/${offerId}`);
            }
        } else if (offerType === 'category') {
            const categoryIds = Array.isArray(categoryId) ? categoryId : (categoryId ? [categoryId] : []);
            if (categoryIds.length === 0) {
                req.flash('error', 'At least one category must be selected');
                return res.redirect(`/admin/editoffer/${offerId}`);
            }
            validatedCategoryIds = await Category.find({ 
                _id: { $in: categoryIds.filter(id => mongoose.Types.ObjectId.isValid(id)) },
                status: true 
            }).select('_id');
            if (validatedCategoryIds.length !== categoryIds.length) {
                req.flash('error', 'One or more selected categories are invalid or inactive');
                return res.redirect(`/admin/editoffer/${offerId}`);
            }
        }

        // Update offer
        const updateData = {
            offerName,
            discount: discountValue,
            startDate: start,
            endDate: end,
            offerType,
            productId: offerType === 'product' ? validatedProductIds.map(id => id._id) : [],
            categoryId: offerType === 'category' ? validatedCategoryIds.map(id => id._id) : [],
            updatedAt: new Date()
        };

        const updatedOffer = await Offer.findByIdAndUpdate(offerId, updateData, { new: true });
        if (!updatedOffer) {
            req.flash('error', 'Offer not found');
            return res.redirect('/admin/offer');
        }

        req.flash('success', 'Offer updated successfully');
        res.redirect('/admin/offer');
    } catch (error) {
        console.error('Error in postEditOffer:', error);
        req.flash('error', 'Error updating offer');
        res.redirect(`/admin/editoffer/${offerId}`);
    }
};

// Block/Unblock offer
exports.blockOffer = async (req, res) => {
    try {
        const offerId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(offerId)) {
            return res.status(400).json({ success: false, message: 'Invalid offer ID' });
        }

        const offer = await Offer.findById(offerId);

        if (!offer) {
            return res.status(404).json({ success: false, message: 'Offer not found' });
        }

        offer.status = !offer.status;
        await offer.save();

        res.json({ 
            success: true, 
            status: offer.status,
            message: `Offer ${offer.status ? 'activated' : 'deactivated'} successfully`
        });
    } catch (error) {
        console.error('Error in blockOffer:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error updating offer status'
        });
    }
};