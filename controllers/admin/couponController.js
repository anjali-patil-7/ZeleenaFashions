const Coupon = require('../../models/couponSchema');

// Get all coupons with search and pagination
exports.getCoupons = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;
        const searchQuery = req.query.query || '';

        // Build query
        const query = searchQuery 
            ? { code: { $regex: searchQuery, $options: 'i' } }
            : {};

        const totalCoupons = await Coupon.countDocuments(query);
        const coupons = await Coupon.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.render('admin/coupon', {
            coupons,
            currentPage: page,
            totalPages: Math.ceil(totalCoupons / limit),
            searchQuery
        });
    } catch (error) {
        console.error('Error fetching coupons:', error);
        req.flash('error', 'Error fetching coupons');
        res.redirect('/admin/coupon');
    }
};

// Render add coupon form
exports.getAddCoupon = (req, res) => {
    try {
        res.render('admin/addcoupon', {
            error: req.flash('error'),
            success: req.flash('success')
        });
    } catch (error) {
        console.error('Error rendering add coupon page:', error);
        req.flash('error', 'Error loading add coupon page');
        res.redirect('/admin/coupon');
    }
};

// Create new coupon
exports.postAddCoupon = async (req, res) => {
    try {
        const {
            couponCode,
            type,
            discount,
            minimumPrice,
            maxRedeem,
            expiry,
            status,
            description
        } = req.body;

        // Validate inputs
        if (!couponCode || !type || !discount || !minimumPrice || !maxRedeem || !expiry) {
            req.flash('error', 'All required fields must be filled');
            return res.redirect('/admin/addcoupon');
        }

        // Check if coupon code already exists
        const existingCoupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
        if (existingCoupon) {
            req.flash('error', 'Coupon code already exists');
            return res.redirect('/admin/addcoupon');
        }

        // Map form type to schema discountType
        const discountTypeMap = {
            percentageDiscount: 'percentage',
            flatDiscount: 'flat'
        };
        const discountType = discountTypeMap[type];
        if (!discountType) {
            console.error(`Invalid discount type received: ${type}`);
            req.flash('error', 'Invalid discount type');
            return res.redirect('/admin/addcoupon');
        }

        // Create new coupon
        const coupon = new Coupon({
            code: couponCode.toUpperCase(),
            discountType,
            discount: parseFloat(discount),
            minimumPrice: parseFloat(minimumPrice),
            maxRedeem: parseInt(maxRedeem),
            expiry: new Date(expiry),
            status: status === 'true',
            description: description || ''
        });

        await coupon.save();
        req.flash('success', 'Coupon created successfully');
        res.redirect('/admin/coupon');
    } catch (error) {
        console.error('Error creating coupon:', error);
        req.flash('error', 'Error creating coupon');
        res.redirect('/admin/addcoupon');
    }
};

// Render edit coupon form
exports.getEditCoupon = async (req, res) => {
    try {
        const coupon = await Coupon.findById(req.params.id);
        if (!coupon) {
            req.flash('error', 'Coupon not found');
            return res.redirect('/admin/coupon');
        }

        res.render('admin/editcoupon', {
            coupon,
            error: req.flash('error'),
            success: req.flash('success')
        });
    } catch (error) {
        console.error('Error fetching coupon:', error);
        req.flash('error', 'Error fetching coupon');
        res.redirect('/admin/coupon');
    }
};

// Update coupon
exports.postEditCoupon = async (req, res) => {
    try {
        const {
            couponCode,
            type,
            discount,
            minimumPrice,
            maxRedeem,
            expiry,
            status,
            description
        } = req.body;

        // Validate inputs
        if (!couponCode || !type || !discount || !minimumPrice || !maxRedeem || !expiry) {
            req.flash('error', 'All required fields must be filled');
            return res.redirect(`/admin/editcoupon/${req.params.id}`);
        }

        // Check if coupon code exists for another coupon
        const existingCoupon = await Coupon.findOne({
            code: couponCode.toUpperCase(),
            _id: { $ne: req.params.id }
        });

        if (existingCoupon) {
            req.flash('error', 'Coupon code already exists');
            return res.redirect(`/admin/editcoupon/${req.params.id}`);
        }

        // Map form type to schema discountType
        const discountTypeMap = {
            percentageDiscount: 'percentage',
            flatDiscount: 'flat'
        };
        const discountType = discountTypeMap[type];
        if (!discountType) {
            console.error(`Invalid discount type received: ${type}`);
            req.flash('error', 'Invalid discount type');
            return res.redirect(`/admin/editcoupon/${req.params.id}`);
        }

        // Update coupon
        const coupon = await Coupon.findByIdAndUpdate(
            req.params.id,
            {
                code: couponCode.toUpperCase(),
                discountType,
                discount: parseFloat(discount),
                minimumPrice: parseFloat(minimumPrice),
                maxRedeem: parseInt(maxRedeem),
                expiry: new Date(expiry),
                status: status === 'true',
                description: description || ''
            },
            { new: true, runValidators: true }
        );

        if (!coupon) {
            req.flash('error', 'Coupon not found');
            return res.redirect('/admin/coupon');
        }

        req.flash('success', 'Coupon updated successfully');
        res.redirect('/admin/coupon');
    } catch (error) {
        console.error('Error updating coupon:', error);
        req.flash('error', 'Error updating coupon');
        res.redirect(`/admin/editcoupon/${req.params.id}`);
    }
};

// Toggle coupon status (block/unblock)
exports.blockCoupon = async (req, res) => {
    try {
        const coupon = await Coupon.findById(req.params.id);
        if (!coupon) {
            return res.status(404).json({ error: 'Coupon not found' });
        }

        coupon.status = !coupon.status;
        await coupon.save();

        res.json({
            success: true,
            status: coupon.status,
            message: `Coupon ${coupon.status ? 'unblocked' : 'blocked'} successfully`
        });
    } catch (error) {
        console.error('Error toggling coupon status:', error);
        res.status(500).json({ error: 'Error toggling coupon status' });
    }
};