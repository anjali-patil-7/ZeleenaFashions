const Address = require('../../models/addressSchema');
const { body, validationResult } = require('express-validator');
const validator = require('validator');

// Get all addresses for the user
exports.getAddresses = async (req, res) => {
    try {
        const addresses = await Address.find({  userId : req.session.user.id}).lean();
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
    body('name')
        .trim()
        .isLength({ min: 3 })
        .withMessage('Name must be at least 3 characters')
        .matches(/^[a-zA-Z\s]+$/)
        .withMessage('Name must contain only alphabets and spaces')
        .not()
        .matches(/^\s/)
        .withMessage('Name cannot start with a space'),
    body('email')
        .trim()
        .isEmail()
        .withMessage('Invalid email address')
        .not()
        .matches(/^\s/)
        .withMessage('Email cannot start with a space'),
    body('mobile')
        .trim()
        .matches(/^[6-9]\d{9}$/)
        .withMessage('Mobile number must start with 6, 7, 8, or 9 and be 10 digits')
        .custom((value) => {
            const digitCount = {};
            for (let digit of value) {
                digitCount[digit] = (digitCount[digit] || 0) + 1;
                if (digitCount[digit] > 3) {
                    throw new Error('Mobile number cannot have any digit repeating more than 3 times');
                }
            }
            return true;
        }),
    body('pincode')
        .trim()
        .isLength({ min: 6, max: 6 })
        .matches(/^\d{6}$/)
        .withMessage('Invalid pincode (must be 6 digits)')
        .not()
        .matches(/^\s/)
        .withMessage('Pincode cannot start with a space'),
    body('houseName')
        .trim()
        .notEmpty()
        .withMessage('House name/number is required')
        .not()
        .matches(/^\s/)
        .withMessage('House name/number cannot start with a space'),
    body('street')
        .trim()
        .notEmpty()
        .withMessage('Street/road is required')
        .not()
        .matches(/^\s/)
        .withMessage('Street/road cannot start with a space'),
    body('city')
        .trim()
        .notEmpty()
        .withMessage('City is required')
        .not()
        .matches(/^\s/)
        .withMessage('City cannot start with a space'),
    body('state')
        .trim()
        .notEmpty()
        .withMessage('State is required')
        .not()
        .matches(/^\s/)
        .withMessage('State cannot start with a space'),
    body('country')
        .trim()
        .notEmpty()
        .withMessage('Country is required')
        .not()
        .matches(/^\s/)
        .withMessage('Country cannot start with a space'),
    body('saveAs')
        .isIn(['Home', 'Work', 'Other'])
        .withMessage('Invalid address type'),
];

// Create address
exports.createAddress = [
    ...validateAddress,
    async (req, res) => {
        console.log('Create address request body:', req.body);
        try {
       const userId = req.session.user.id;
          
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

            if (!userId) {
              console.error("User not authenticated");
              return res.status(401).json({
                success: false,
                errors: ["User not authenticated"],
              });
            }

            const newAddress = new Address({
              userId : req.session.user.id,
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
              isDefault: false,
            });
       console.log("Address saved:", newAddress);
            await newAddress.save();
          
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
     const userId = req.session.user.id;

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
        const addressId = req.params.id;
     const userId = req.session.user.id;

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
        const addressId = req.params.id;
      const userId = req.session.user.id;
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
        if (!name || name.trim().length < 3 || !/^[a-zA-Z\s]+$/.test(name) || /^\s/.test(name)) {
            errors.push('Name is required, should be at least 3 characters, contain only alphabets and spaces, and not start with a space.');
        }
        if (!mobile || !/^[6-9]\d{9}$/.test(mobile.trim())) {
    errors.push('Mobile number must start with 6, 7, 8, or 9 and be 10 digits with no spaces, letters, or symbols');
}
        if (!email || !validator.isEmail(email) || /^\s/.test(email)) {
            errors.push('Please enter a valid email address that does not start with a space.');
        }
        if (!pincode || !/^\d{6}$/.test(pincode) || /^\s/.test(pincode)) {
            errors.push('Please enter a valid pincode (6 digits) that does not start with a space.');
        }
        if (!houseName || houseName.trim() === '' || /^\s/.test(houseName)) {
            errors.push('House name/number is required and cannot start with a space.');
        }
        if (!street || street.trim() === '' || /^\s/.test(street)) {
            errors.push('Street/road is required and cannot start with a space.');
        }
        if (!city || city.trim() === '' || /^\s/.test(city)) {
            errors.push('City is required and cannot start with a space.');
        }
        if (!state || state.trim() === '' || /^\s/.test(state)) {
            errors.push('State is required and cannot start with a space.');
        }
        if (!country || country.trim() === '' || /^\s/.test(country)) {
            errors.push('Country is required and cannot start with a space.');
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
            return res.redirect('/ures');
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

// Delete address
exports.deleteAddress = async (req, res) => {
    try {
        const addressId = req.params.id;
       const userId = req.session.user.id;

        // Find the address by id and ensure it belongs to the user
        const address = await Address.findOne({ _id: addressId, userId: userId });

        if (!address) {
            req.flash('error', 'Address not found or you do not have permission to delete it');
            return res.redirect('/address');
        }

        // Prevent deletion of default address
        if (address.isDefault) {
            req.flash('error', 'Cannot delete the default address. Set another address as default first.');
            return res.redirect('/address');
        }

        // Delete the address
        await Address.findByIdAndDelete(addressId);

        // Flash success message and redirect
        req.flash('success', 'Address deleted successfully');
        res.redirect('/address');
    } catch (error) {
        console.error('Error deleting address:', error);
        req.flash('error', 'An error occurred while deleting the address.');
        res.redirect('/address');
    }
};