const mongoose = require('mongoose');
const Wishlist = require('../../models/wishlistSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');

// Get user's wishlist
exports.getWishlist = async (req, res) => {
    try {
        const userId = req.session.userId;
        const wishlist = await Wishlist.find({ userId })
            .populate({
                path: 'wishlistItems.productId',
                select: 'productName price productImage totalStock isListed category',
                populate: { path: 'category', select: 'status name' }
            });

        res.render('user/wishlist', {
            wishlistDetails: wishlist,
            user: req.user
        });
    } catch (error) {
        console.error('Error in getWishlist:', error);
        res.status(500).json({ message: 'Error fetching wishlist', error: error.message });
    }
};

// Add product to wishlist
exports.addToWishlist = async (req, res) => {
    try {
        const { productId } = req.body;
        const userId = req.user.id;

        // Validate productId
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            console.log(`Invalid productId: ${productId}`);
            return res.status(400).json({ success: false, message: 'Invalid product ID' });
        }

        // Validate product exists and is available
        const product = await Product.findById(productId).populate({
            path: 'category',
            select: 'status name'
        });
        if (!product) {
            console.log(`Product not found for ID: ${productId}`);
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        // Log product and category details for debugging
        console.log('addToWishlist Product details:', {
            productId: product._id,
            productName: product.productName,
            status: product.status,
            totalStock: product.totalStock,
            category: product.category ? {
                id: product.category._id,
                name: product.category.name,
                status: product.category.status
            } : 'No category'
        });

        // Check product and category availability
        if (typeof product.status !== 'boolean' || product.status === false) {
            console.log(`Validation failed: Product not listed: ${productId}, status: ${product.status}`);
            return res.status(400).json({ success: false, message: 'This product is not listed' });
        }
        if (!product.category) {
            console.warn(`Product ${productId} has no associated category`);
            return res.status(400).json({ success: false, message: 'Product category is missing' });
        }
        if (typeof product.category.status !== 'boolean' || product.category.status === false) {
            console.log(`Validation failed: Category not listed: ${product.category._id}, status: ${product.category.status}`);
            return res.status(400).json({ success: false, message: 'Product category is not listed' });
        }

        // Find or create wishlist
        let wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            wishlist = new Wishlist({ userId, wishlistItems: [] });
        }

        // Check if product is already in wishlist
        if (wishlist.wishlistItems.some(item => item.productId.toString() === productId)) {
            console.log(`Product already in wishlist: ${productId}`);
            return res.status(400).json({ success: false, message: 'Product already in wishlist' });
        }

        // Add product to wishlist
        wishlist.wishlistItems.push({ productId });
        await wishlist.save();

        res.status(200).json({ success: true, message: 'Product added to wishlist' });
    } catch (error) {
        console.error('Error in addToWishlist:', {
            error: error.message,
            stack: error.stack,
            productId: req.body.productId,
            userId: req.user.id
        });
        res.status(500).json({ success: false, message: 'Error adding to wishlist', error: error.message });
    }
};

// Remove product from wishlist
exports.removeFromWishlist = async (req, res) => {
    try {
        const { productId } = req.body;
        const userId = req.user.id;

        const wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            return res.status(404).json({ success: false, message: 'Wishlist not found' });
        }

        wishlist.wishlistItems = wishlist.wishlistItems.filter(
            item => item.productId.toString() !== productId
        );

        await wishlist.save();
        res.status(200).json({ success: true, message: 'Product removed from wishlist' });
    } catch (error) {
        console.error('Error in removeFromWishlist:', error);
        res.status(500).json({ success: false, message: 'Error removing from wishlist', error: error.message });
    }
};

// Add product to cart and remove from wishlist
exports.addToCartFromWishlist = async (req, res) => {
    try {
        const { productId } = req.body;
        const userId = req.user.id;
        if (!userId) {
            console.log('No user ID found in request');
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        if (!productId) {
            console.log('No productId provided');
            return res.status(400).json({ success: false, message: 'Product ID is required' });
        }

        // Validate product exists and is available
        const product = await Product.findById(productId).populate({
            path: 'category',
            select: 'status name'
        });
        if (!product) {
            console.log('Product not found for ID:', productId);
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        // Log product and category details for debugging
        console.log('addToCartFromWishlist Product details:', {
            productId: product._id,
            productName: product.productName,
            status: product.status,
            totalStock: product.totalStock,
            category: product.category ? {
                id: product.category._id,
                name: product.category.name,
                status: product.category.status
            } : 'No category'
        });

        // Check product and category availability
        if (typeof product.status !== 'boolean' || product.status === false) {
            console.log('Validation failed: Product not listed:', productId, product.status);
            return res.status(400).json({ success: false, message: 'This product is not listed' });
        }
        if (!product.category) {
            console.log('Validation failed: No category for product:', productId);
            return res.status(400).json({ success: false, message: 'Product category is missing' });
        }
        if (typeof product.category.status !== 'boolean' || product.category.status === false) {
            console.log('Validation failed: Category not listed:', product.category._id, product.category.status);
            return res.status(400).json({ success: false, message: 'Product category is not listed' });
        }
        if (product.totalStock <= 0) {
            console.log('Validation failed: Out of stock:', productId, product.totalStock);
            return res.status(400).json({ success: false, message: 'Product out of stock' });
        }

        // Find or create cart
        let cart = await Cart.findOne({ user: userId });
        if (!cart) {
            cart = new Cart({
                user: userId,
                cartItem: [],
                cartTotal: 0
            });
        }

        // Check if product is already in cart
        const existingItem = cart.cartItem.find(item => item.productId.toString() === productId);
        const quantityToAdd = 1; // Default quantity to add
        const maxQuantity = 7; // Maximum allowed quantity per product

        if (existingItem) {
            // Increment quantity if within stock and max limit
            const newQuantity = existingItem.quantity + quantityToAdd;
            if (newQuantity > product.totalStock) {
                return res.status(400).json({ success: false, message: `Only ${product.totalStock} items available in stock` });
            }
            if (newQuantity > maxQuantity) {
                return res.status(400).json({ success: false, message: `Maximum quantity per product is ${maxQuantity}` });
            }
            existingItem.quantity = newQuantity;
            existingItem.total = existingItem.quantity * product.price;
        } else {
            // Add new item to cart
            if (quantityToAdd > product.totalStock) {
                return res.status(400).json({ success: false, message: `Only ${product.totalStock} items available in stock` });
            }
            cart.cartItem.push({
                productId,
                quantity: quantityToAdd,
                price: product.price,
                stock: product.totalStock,
                total: product.price * quantityToAdd
            });
        }

        // Update cart total
        cart.cartTotal = cart.cartItem.reduce((total, item) => total + item.total, 0);
        await cart.save();

        // Remove from wishlist
        const wishlist = await Wishlist.findOne({ userId });
        if (wishlist) {
            wishlist.wishlistItems = wishlist.wishlistItems.filter(
                item => item.productId.toString() !== productId
            );
            await wishlist.save();
        }

        res.status(200).json({ success: true, message: 'Product added to cart and removed from wishlist' });
    } catch (error) {
        console.error('Error in addToCartFromWishlist:', error);
        res.status(500).json({ success: false, message: 'Error adding to cart', error: error.message });
    }
};
