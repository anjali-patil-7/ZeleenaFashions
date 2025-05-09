const mongoose = require('mongoose');
const Offer = require('../../models/offerSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema'); 

// List all offers with pagination and search
exports.getOfferList = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;
        const searchQuery = req.query.query || '';

        const query = searchQuery 
            ? { offerName: { $regex: searchQuery, $options: 'i' } }
            : {};

        const totalOffers = await Offer.countDocuments(query);
        const offers = await Offer.find(query)
            .populate('productId', 'productName')
            .populate('categoryId', 'name')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

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
            return res.status(400).json({ error: 'Offer name must be 3-50 characters long' });
        }

        const discountValue = parseFloat(discount);
        if (isNaN(discountValue) || discountValue < 1 || discountValue > 100) {
            return res.status(400).json({ error: 'Discount must be between 1-100%' });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        const now = new Date();

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return res.status(400).json({ error: 'Invalid date format' });
        }

        if (start < now) {
            return res.status(400).json({ error: 'Start date cannot be in the past' });
        }

        if (end <= start) {
            return res.status(400).json({ error: 'End date must be after start date' });
        }

        if (!['product', 'category'].includes(offerType)) {
            return res.status(400).json({ error: 'Invalid offer type' });
        }

        // Validate productIds or categoryIds based on offerType
        let validatedProductIds = [];
        let validatedCategoryIds = [];

        if (offerType === 'product') {
            // Ensure productId is an array
            const productIds = Array.isArray(productId) ? productId : (productId ? [productId] : []);
            if (productIds.length === 0) {
                return res.status(400).json({ error: 'At least one product must be selected' });
            }
            // Verify all productIds exist
            validatedProductIds = await Product.find({ _id: { $in: productIds } }).select('_id');
            if (validatedProductIds.length !== productIds.length) {
                return res.status(400).json({ error: 'One or more selected products are invalid' });
            }
        } else if (offerType === 'category') {
            // Ensure categoryId is an array
            const categoryIds = Array.isArray(categoryId) ? categoryId : (categoryId ? [categoryId] : []);
            if (categoryIds.length === 0) {
                return res.status(400).json({ error: 'At least one category must be selected' });
            }
            // Verify all categoryIds exist
            validatedCategoryIds = await Category.find({ _id: { $in: categoryIds } }).select('_id');
            if (validatedCategoryIds.length !== categoryIds.length) {
                return res.status(400).json({ error: 'One or more selected categories are invalid' });
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

        // Save offer to database
        await newOffer.save();

        // Redirect to offers page with success message
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

        if (!discount || discount < 1 || discount > 100) {
            req.flash('error', 'Discount must be between 1-100%');
            return res.redirect(`/admin/editoffer/${offerId}`);
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        const today = new Date();

        if (start < today) {
            req.flash('error', 'Start date cannot be in the past');
            return res.redirect(`/admin/editoffer/${offerId}`);
        }

        if (end <= start) {
            req.flash('error', 'End date must be after start date');
            return res.redirect(`/admin/editoffer/${offerId}`);
        }

        // Convert productId/categoryId to arrays if they are strings
        const productIds = productId ? (Array.isArray(productId) ? productId : [productId]) : [];
        const categoryIds = categoryId ? (Array.isArray(categoryId) ? categoryId : [categoryId]) : [];

        if (offerType === 'product' && productIds.length === 0) {
            req.flash('error', 'At least one product must be selected');
            return res.redirect(`/admin/editoffer/${offerId}`);
        }

        if (offerType === 'category' && categoryIds.length === 0) {
            req.flash('error', 'At least one category must be selected');
            return res.redirect(`/admin/editoffer/${offerId}`);
        }

        const updateData = {
            offerName,
            discount: parseInt(discount),
            startDate: start,
            endDate: end,
            offerType,
            productId: offerType === 'product' ? productIds : [],
            categoryId: offerType === 'category' ? categoryIds : []
        };

        await Offer.findByIdAndUpdate(offerId, updateData);
        req.flash('success', 'Offer updated successfully');
        res.redirect('/admin/offer');
    } catch (error) {
        console.error('Error in postEditOffer:', error);
        req.flash('error', 'Error updating offer');
        res.redirect(`/admin/editoffer/${req.params.id}`);
    }
};

// Block/Unblock offer
exports.blockOffer = async (req, res) => {
    try {
        const offerId = req.params.id;
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