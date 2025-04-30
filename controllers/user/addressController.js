const Address = require('../../models/addressSchema');
const { body, validationResult } = require('express-validator');
const validator = require('validator'); // Ensure validator is imported

// Get all addresses for the user
exports.getAddresses = async (req, res) => {
    try {
        const addresses = await Address.find({ userId: req.user.id }).lean();
        console.log('Fetched addresses:', addresses);
        res.render('user/address', {
            address: addresses,
            user: req.user,
            error_msg: req.flash('error'),
            success_msg: req.flash('success')
        });
    } catch (error) {
        console.error('Error fetching addresses:', error);
        req.flash('error', 'Error fetching addresses');
        res.redirect('/profile');
    }
};

// Validation middleware for creating address
const validateAddress = [
    body('name').trim().isLength({ min: 3 }).withMessage('Name must be at least 3 characters'),
    body('email').trim().isEmail().withMessage('Invalid email address'),
    body('mobile').trim().isLength({ min: 10, max: 10 }).matches(/^\d{10}$/).withMessage('Invalid mobile number (must be 10 digits)'),
    body('pincode').trim().isLength({ min: 6, max: 6 }).matches(/^\d{6}$/).withMessage('Invalid pincode (must be 6 digits)'),
    body('houseName').trim().notEmpty().withMessage('House name/number is required'),
    body('street').trim().notEmpty().withMessage('Street/road is required'),
    body('city').trim().notEmpty().withMessage('City is required'),
    body('state').trim().notEmpty().withMessage('State is required'),
    body('country').trim().notEmpty().withMessage('Country is required'),
    body('saveAs').isIn(['Home', 'Work', 'Other']).withMessage('Invalid address type'),
];

// Create address
exports.createAddress = [
    ...validateAddress,
    async (req, res) => {
        console.log('Create address request body:', req.body);
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                console.log('Validation errors:', errors.array());
                return res.status(400).json({
                    success: false,
                    errors: errors.array().map(err => err.msg)
                });
            }

            const {
                name,
                email,
                mobile,
                pincode,
                houseName,
                street,
                city,
                state,
                country,
                saveAs
            } = req.body;

            if (!req.user || !req.user.id) {
                console.error('User not authenticated');
                return res.status(401).json({
                    success: false,
                    errors: ['User not authenticated']
                });
            }

            const newAddress = new Address({
                userId: req.user.id,
                name,
                email,
                mobile,
                pincode,
                houseName,
                street,
                city,
                state,
                country,
                saveAs,
                isDefault: false
            });

            await newAddress.save();
            console.log('Address saved:', newAddress);
            req.flash('success', 'Address added successfully');
            res.status(200).json({
                success: true,
                message: 'Address added successfully'
            });
        } catch (error) {
            console.error('Error creating address:', error);
            req.flash('error', 'Error adding address. Please try again.');
            res.status(500).json({
                success: false,
                errors: ['Error adding address. Please try again.']
            });
        }
    }
];

// Render address form
exports.getAddressForm = (req, res) => {
    try {
        res.render('user/createaddress', {
            title: 'Add New Address',
            errorMessages: req.flash('error'),
            successMessages: req.flash('success'),
            session: req.session || {},
            user: req.user
        });
    } catch (error) {
        console.error('Error rendering address form:', error);
        req.flash('error', 'Error loading address form');
        res.redirect('/');
    }
};

// Set address as default
exports.setDefaultAddress = async (req, res) => {
    try {
        const addressId = req.params.id;
        const userId = req.user.id;

        await Address.updateMany(
            { userId: userId, isDefault: true },
            { $set: { isDefault: false } }
        );

        const updatedAddress = await Address.findOneAndUpdate(
            { _id: addressId, userId: userId },
            { $set: { isDefault: true } },
            { new: true }
        );

        if (!updatedAddress) {
            return res.status(404).json({ success: false, message: 'Address not found or does not belong to user' });
        }

        req.flash('success', 'Default address updated successfully');
        res.redirect('/address');
    } catch (error) {
        console.error('Error setting default address:', error);
        req.flash('error', 'Failed to set default address');
        res.redirect('/address');
    }
};

// Get edit address form
exports.getEditAddress = async (req, res) => {
    try {
        const addressId = req.params.id; // Use 'id' to match the route parameter
        const userId = req.user.id;

        // Find the address by ID and ensure it belongs to the user
        const address = await Address.findOne({ _id: addressId, userId: userId }).lean();

        if (!address) {
            req.flash('error', 'Address not found or you do not have permission to edit this address');
            return res.redirect('/address');
        }

        res.render('user/editaddress', {
            address,
            addressId,
            errors: [],
            user: req.user,
            error_msg: req.flash('error'),
            success_msg: req.flash('success')
        });
    } catch (error) {
        console.error('Error fetching address:', error);
        req.flash('error', 'An error occurred while fetching the address. Please try again later.');
        res.redirect('/address');
    }
};

// Update address
exports.updateAddress = async (req, res) => {
    try {
        const addressId = req.params.id; // Use 'id' to match the route parameter
        const userId = req.user.id;
        const {
            name,
            mobile,
            email,
            pincode,
            houseName,
            street,
            city,
            state,
            country,
            saveAs,
            isDefault,
        } = req.body;

        // Validation errors array
        let errors = [];

        // Validate inputs
        if (!name || name.trim().length < 3) {
            errors.push('Name is required and should be at least 3 characters.');
        }
        if (!mobile || !validator.isMobilePhone(mobile, 'any', { strictMode: false })) {
            errors.push('Please enter a valid mobile number (10 digits).');
        }
        if (!email || !validator.isEmail(email)) {
            errors.push('Please enter a valid email address.');
        }
        if (!pincode || !/^\d{6}$/.test(pincode)) {
            errors.push('Please enter a valid pincode (6 digits).');
        }
        if (!houseName || houseName.trim() === '') {
            errors.push('House name/number is required.');
        }
        if (!street || street.trim() === '') {
            errors.push('Street/road is required.');
        }
        if (!city || city.trim() === '') {
            errors.push('City is required.');
        }
        if (!state || state.trim() === '') {
            errors.push('State is required.');
        }
        if (!country || country.trim() === '') {
            errors.push('Country is required.');
        }
        if (!saveAs || !['Home', 'Work', 'Other'].includes(saveAs)) {
            errors.push('Please select a valid address type.');
        }

        // If there are validation errors, re-render the form with errors
        if (errors.length > 0) {
            return res.render('user/editaddress', {
                address: req.body,
                addressId,
                errors,
                user: req.user,
                error_msg: req.flash('error'),
                success_msg: req.flash('success')
            });
        }

        // Find the address to update
        const address = await Address.findOne({ _id: addressId, userId: userId });

        if (!address) {
            req.flash('error', 'Address not found or you do not have permission to edit this address');
            return res.redirect('/address');
        }

        // Update address fields
        address.name = name.trim();
        address.mobile = mobile.trim();
        address.email = email.trim();
        address.pincode = pincode.trim();
        address.houseName = houseName.trim();
        address.street = street.trim();
        address.city = city.trim();
        address.state = state.trim();
        address.country = country.trim();
        address.saveAs = saveAs;
        address.isDefault = isDefault === 'on';

        // If the address is set as default, unset default for other addresses
        if (address.isDefault) {
            await Address.updateMany(
                { userId: userId, _id: { $ne: addressId }, isDefault: true },
                { isDefault: false }
            );
        }

        // Save the updated address
        await address.save();

        req.flash('success', 'Address updated successfully!');
        res.redirect('/address');
    } catch (error) {
        console.error('Error updating address:', error);
        res.render('user/editaddress', {
            address: req.body,
            addressId,
            errors: ['An error occurred while updating the address. Please try again.'],
            user: req.user,
            error_msg: req.flash('error'),
            success_msg: req.flash('success')
        });
    }
};

//**Delete address */
exports.deleteAddress = async(req,res)=>{
  try{
    const addressId = req.params.id;
    const userId = req.user._id
    //find the address by id and enusre it belong to it
    const address = await Address.findOne({_id:addressId, user:userId})

    if(!address){
      return res.status(404).flash('error','Address not found or you do not have permission to delete it')
      redirect('/address')
    }
    //prevent deletion of default address
    if(address.isDefault){
      return res.status(400).flash('error','cannot delete the default address. set another address as default first.').redirect('/address')
    }
    //dlete the address
    await Address.findByIdAndDelete(addressId)
    
    //flas success message and redirect
    req.flash('success','Address deleted successfully')
    res.redirect('/address')
  }catch(error){
    console.error('Error deleteing address:',error)
    req.flash('error','An error occured while deleteing and address.')
    res.redirect('/address')
  }
}