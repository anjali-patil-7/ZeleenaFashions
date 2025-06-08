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
            // Filter valid ObjectIds and convert to mongoose.Types.ObjectId
            const validProductIds = productIds.filter(id => mongoose.Types.ObjectId.isValid(id))
                                             .map(id => new mongoose.Types.ObjectId(id));
            if (validProductIds.length !== productIds.length) {
                req.flash('error', 'One or more product IDs are invalid');
                return res.redirect('/admin/addoffer');
            }
            // Validate against Product collection
            validatedProductIds = await Product.find({ 
                _id: { $in: validProductIds },
                status: true 
            }).select('_id');
            if (validatedProductIds.length !== validProductIds.length) {
                req.flash('error', 'One or more selected products are invalid or inactive');
                return res.redirect('/admin/addoffer');
            }
            // Map to ObjectId instances for saving
            validatedProductIds = validatedProductIds.map(doc => doc._id);
            console.log('Validated Product IDs:', validatedProductIds);
        } else if (offerType === 'category') {
            const categoryIds = Array.isArray(categoryId) ? categoryId : (categoryId ? [categoryId] : []);
            if (categoryIds.length === 0) {
                req.flash('error', 'At least one category must be selected');
                return res.redirect('/admin/addoffer');
            }
            // Filter valid ObjectIds and convert to mongoose.Types.ObjectId
            const validCategoryIds = categoryIds.filter(id => mongoose.Types.ObjectId.isValid(id))
                                               .map(id => new mongoose.Types.ObjectId(id));
            if (validCategoryIds.length !== categoryIds.length) {
                req.flash('error', 'One or more category IDs are invalid');
                return res.redirect('/admin/addoffer');
            }
            // Validate against Category collection
            validatedCategoryIds = await Category.find({ 
                _id: { $in: validCategoryIds },
                status: true 
            }).select('_id');
            if (validatedCategoryIds.length !== validCategoryIds.length) {
                req.flash('error', 'One or more selected categories are invalid or inactive');
                return res.redirect('/admin/addoffer');
            }
            // Map to ObjectId instances for saving
            validatedCategoryIds = validatedCategoryIds.map(doc => doc._id);
            console.log('Validated Category IDs:', validatedCategoryIds);
        }

        // Create new offer
        const newOffer = new Offer({
            offerName,
            discount: discountValue,
            startDate: start,
            endDate: end,
            offerType,
            productId: offerType === 'product' ? validatedProductIds : [],
            categoryId: offerType === 'category' ? validatedCategoryIds : [],
            status: true
        });

        // Save to database
        const savedOffer = await newOffer.save();
        
        // Log the saved offer for debugging
        console.log('Saved Offer:', JSON.stringify(savedOffer, null, 2));

        // Verify the saved data
        if (offerType === 'product' && (!savedOffer.productId || savedOffer.productId.length !== validatedProductIds.length)) {
            console.error('Product IDs not saved correctly:', savedOffer.productId);
            req.flash('error', 'Failed to save product associations. Please try again.');
            return res.redirect('/admin/addoffer');
        }
        if (offerType === 'category' && (!savedOffer.categoryId || savedOffer.categoryId.length !== validatedCategoryIds.length)) {
            console.error('Category IDs not saved correctly:', savedOffer.categoryId);
            req.flash('error', 'Failed to save category associations. Please try again.');
            return res.redirect('/admin/addoffer');
        }
        if (savedOffer.status !== true) {
            console.error('Status not saved as true:', savedOffer.status);
            req.flash('error', 'Failed to set offer status. Please try again.');
            return res.redirect('/admin/addoffer');
        }

        req.flash('success', 'Offer created successfully');
        return res.redirect('/admin/offer');

    } catch (error) {
        console.error('Error creating offer:', error);
        req.flash('error', 'Failed to create offer. Please try again.');
        return res.redirect('/admin/addoffer');
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

        const offer = await Offer.findById(offerId);
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
            error_msg: req.flash('error'),
            success_msg: req.flash('success'),
            formData: req.flash('formData')[0] || {} // Ensure formData is always defined
        });
    } catch (error) {
        console.error('Error in getEditOffer:', error.message, error.stack);
        req.flash('error', `Error loading offer: ${error.message}`);
        res.redirect('/admin/offer');
    }
};

// Handle edit offer submission
exports.postEditOffer = async (req, res) => {
  // // try {
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

    // Log the incoming request body for debugging
    console.log('Request Body:', {
      offerId,
      offerName,
      discount,
      startDate,
      endDate,
      offerType,
      productId,
      categoryId
    });

    // Ensure productId and categoryId are arrays
    const productIds = Array.isArray(productId) ? productId : (productId ? [productId] : []);
    const categoryIds = Array.isArray(categoryId) ? categoryId : (categoryId ? [categoryId] : []);

    // Server-side validation based on original offerSchema
    const errors = {};

    // Validate offerName
    if (!offerName || offerName.trim() === '') {
      errors.offerName = 'Offer name is required';
    } else if (offerName.length < 3 || offerName.length > 50) {
      errors.offerName = 'Offer name must be 3-50 characters long';
    }

    // Validate discount
    const discountValue = parseFloat(discount);
    if (isNaN(discountValue)) {
      errors.discount = 'Discount percentage is required';
    } else if (discountValue < 1 || discountValue > 100) {
      errors.discount = 'Discount must be between 1-100%';
    }

    // Validate startDate
    const startDateObj = new Date(startDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!startDate || isNaN(startDateObj)) {
      errors.startDate = 'Start date is required';
    } else if (startDateObj < today) {
      errors.startDate = 'Start date cannot be in the past';
    }

    // Validate endDate
    const endDateObj = new Date(endDate);
    if (!endDate || isNaN(endDateObj)) {
      errors.endDate = 'End date is required';
    } else if (endDateObj < today) {
      errors.endDate = 'End date cannot be in the past';
    } else if (startDateObj && !isNaN(startDateObj) && endDateObj <= startDateObj) {
      errors.endDate = 'End date must be after start date';
    } else if (startDateObj && !isNaN(startDateObj) && (endDateObj - startDateObj) < 3600000) {
      errors.endDate = 'Offer must be active for at least 1 hour';
    }

    // Validate offerType
    if (!offerType || !['product', 'category'].includes(offerType)) {
      errors.offerType = 'Please select a valid offer type';
    }

    // Validate productId or categoryId based on offerType
    if (offerType === 'product') {
      if (productIds.length === 0) {
        errors.productId = 'At least one product must be selected';
      } else {
        const products = await Product.find({ _id: { $in: productIds } }).catch(err => {
          console.error('Error querying products:', err);
          return [];
        });
        if (products.length !== productIds.length) {
          errors.productId = 'One or more selected products are invalid';
        }
      }
      categoryIds.length = 0; // Clear categoryId for product offer
    } else if (offerType === 'category') {
      if (categoryIds.length === 0) {
        errors.categoryId = 'At least one category must be selected';
      } else {
        const categories = await Category.find({ _id: { $in: categoryIds } }).catch(err => {
          console.error('Error querying categories:', err);
          return [];
        });
        if (categories.length !== categoryIds.length) {
          errors.categoryId = 'One or more selected categories are invalid';
        }
      }
      productIds.length = 0; // Clear productId for category offer
    }

    // If there are validation errors, return them
    if (Object.keys(errors).length > 0) {
      console.log('Validation Errors:', errors);
      return res.status(400).json({
        success: false,
        errors,
        formData: {
          offerName,
          discount,
          startDate,
          endDate,
          offerType,
          productId: productIds,
          categoryId: categoryIds
        }
      });
    }

    // Update the offer
    const updatedOffer = await Offer.findByIdAndUpdate(
      offerId,
      {
        offerName,
        discount: discountValue,
        startDate: startDateObj,
        endDate: endDateObj,
        offerType,
        productId: productIds,
        categoryId: categoryIds,
        status: true
      },
      { new: true, runValidators: true }
    ).catch(err => {
      console.error('Error updating offer in DB:', err);
      return null;
    });

    if (!updatedOffer) {
      console.log('Offer not found for ID:', offerId);
      return res.status(404).json({
        success: false,
        error_msg: 'Offer not found'
      });
    }

    console.log('Offer updated successfully:', updatedOffer);
    return res.status(200).json({
      success: true,
      success_msg: 'Offer updated successfully'
    });

  // } catch (error) {
  //   console.error('Error updating offer:', error);
  //   return res.status(500).json({
  //     success: false,
  //     error_msg: 'An error occurred while updating the offer'
  //   });
  // }
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
