const mongoose = require("mongoose");
const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Wishlist = require('../../models/wishlistSchema');
const Offer = require('../../models/offerSchema');
const Coupon = require('../../models/couponSchema'); // Added Coupon model import

// Helper: Find the best offer for a product
const getBestOffer = async (product) => {
    const currentDate = new Date();
    // Look for product-specific offers
    const productOffers = await Offer.find({
        offerType: 'product',
        productId: product._id,
        status: true,
        startDate: { $lte: currentDate },
        endDate: { $gte: currentDate },
    }).lean();
    
    // Look for category-specific offers
    const categoryOffers = await Offer.find({
        offerType: 'category',
        categoryId: product.category,
        status: true,
        startDate: { $lte: currentDate },
        endDate: { $gte: currentDate },
    }).lean();
    
    // Combine offers and find the best discount
    const allOffers = [...productOffers, ...categoryOffers];
    if (allOffers.length === 0) return { discount: 0, finalPrice: product.price, offerName: '' };
    
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

// List Products in Cart
exports.getCart = async (req, res) => {
    try {
        const userId = req.session.user.id;

        if (!userId) {
            return res.status(401).json({ message: 'Please log in to view your cart' });
        }

        const cartDetails = await Cart.findOne({ user: userId }).populate({
            path: 'cartItem.productId',
            populate: { path: 'category' },
        });
    
        // Attach offers to cart items
        let appliedOffers = {};
        if (cartDetails && cartDetails.cartItem) {
            for (let item of cartDetails.cartItem) {
                if (item.productId) {
                    const offer = await getBestOffer(item.productId);
                    appliedOffers[item.productId._id] = offer;
                    item.price = offer.finalPrice; // Update price to reflect offer
                    item.total = item.quantity * offer.finalPrice; // Update total
                }
            }
            // Recalculate cart total
            cartDetails.cartTotal = cartDetails.cartItem.reduce((total, item) => total + item.total, 0);
            await cartDetails.save();
        }

        res.render('user/cart', {
            cartDetails: cartDetails || { cartItem: [], cartTotal: 0 },
            appliedOffers,
            error_msg: req.flash('error_msg'),
            success_msg: req.flash('success_msg'),
        });
    } catch (error) {
        console.error('Error in getCart:', error);
        req.flash('error_msg', 'Error loading cart');
        res.redirect('/shop');
    }
};




// Add to Cart function
exports.addToCart = async (req, res) => {
    try {
        // Check if user is logged in
        const userId = req.session.user.id;
        if (!userId) {
            return res.status(401).json({ message: 'Please log in to add items to cart' });
        }

        // Get product ID and data from request
        const { productId } = req.params;
        const { quantity = 1, fromSingleProduct = false } = req.body;
        
        // Log what we received
        console.log('Received - Product ID:', productId, 'Quantity:', quantity, 'From Single Product Page:', fromSingleProduct);

        // Check if product ID is valid
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ message: 'Invalid product ID' });
        }

        // Find the product and its category
        const product = await Product.findById(productId).populate('category');
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // Log product details
        console.log('Product Details:', {
            Name: product.productName,
            Available: product.status,
            Stock: product.totalStock,
            Category: product.category ? product.category.name : 'No category',
            CategoryAvailable: product.category ? product.category.status : 'N/A'
        });

        // Check if product or category is unavailable
        if (!product.status || !product.category || !product.category.status) {
            return res.status(400).json({ message: 'This product is not available' });
        }

        // Get the best price after any offers
        const offer = await getBestOffer(product);
        const finalPrice = offer.finalPrice;

        // Decide quantity: use selected quantity from product page, or 1 from other pages
        let qty = fromSingleProduct ? parseInt(quantity) : 1;
        console.log('Final Quantity to Use:', qty);

        // Check if quantity is valid
        if (isNaN(qty) || qty < 1) {
            return res.status(400).json({ message: 'Invalid quantity' });
        }
        
        // Check stock availability
        if (qty > product.totalStock) {
            return res.status(400).json({ message: `Only ${product.totalStock} items available in stock` });
        }
        
        // Limit to 7 only for single product page
        if (fromSingleProduct && qty > 7) {
            return res.status(400).json({ message: 'Maximum quantity per product is 7' });
        }

        // Find or create the user's cart
        let cart = await Cart.findOne({ user: userId });
        if (!cart) {
            cart = new Cart({
                user: userId,
                cartItem: [],
                cartTotal: 0,
            });
        }

        // Check if product is already in cart
        const existingItem = cart.cartItem.find(
            (item) => item.productId.toString() === productId
        );

        if (existingItem) {
            // Update existing item
            const newQuantity = existingItem.quantity + qty;
            console.log('Updating Existing Item - New Quantity:', newQuantity);
            
            if (newQuantity > product.totalStock) {
                return res.status(400).json({ message: `Only ${product.totalStock} items available in stock` });
            }
            if (fromSingleProduct && newQuantity > 7) {
                return res.status(400).json({ message: 'Maximum quantity per product is 7' });
            }
            
            existingItem.quantity = newQuantity;
            existingItem.price = finalPrice;
            existingItem.total = existingItem.quantity * finalPrice;
        } else {
            // Add new item
            console.log('Adding New Item - Quantity:', qty);
            cart.cartItem.push({
                productId,
                quantity: qty,
                price: finalPrice,
                stock: product.totalStock,
                total: finalPrice * qty,
            });
        }

        // Update total cart cost
        cart.cartTotal = cart.cartItem.reduce((total, item) => total + item.total, 0);
        await cart.save();
        console.log('Cart Saved - Items:', cart.cartItem);

        // Try to remove from wishlist
        try {
            await Wishlist.updateOne(
                { userId },
                { $pull: { wishlistItems: { productId } } }
            );
        } catch (wishlistError) {
            console.error('Wishlist update failed, but continuing:', wishlistError);
        }

        // Send success response
        return res.status(200).json({
            success: true,
            message: 'Product added to cart successfully',
            cartCount: cart.cartItem.length,
        });
    } catch (error) {
        console.error('Error in addToCart:', error);
        return res.status(500).json({ message: 'Error adding product to cart', error: error.message });
    }
};

// Update Cart (Increment/Decrement Quantity)
exports.updateCart = async (req, res) => {
    try {
        const userId = req.session.user.id;
        if (!userId) {
            return res.status(401).json({ message: 'Please log in' });
        }

        const { productId, quantity } = req.body;
        const product = await Product.findById(productId);

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // Get best offer for the product
        const offer = await getBestOffer(product);
        const finalPrice = offer.finalPrice;

        // Validate stock and max quantity
        if (quantity > product.totalStock) {
            return res.status(400).json({ message: `Only ${product.totalStock} items available in stock` });
        }
        if (quantity > 7) {
            return res.status(400).json({ message: 'Maximum quantity per product is 7' });
        }
        if (quantity < 1) {
            return res.status(400).json({ message: 'Quantity cannot be less than 1' });
        }

        const cart = await Cart.findOne({ user: userId });
        if (!cart) {
            return res.status(404).json({ message: 'Cart not found' });
        }

        const item = cart.cartItem.find((i) => i.productId.toString() === productId);
        if (!item) {
            return res.status(404).json({ message: 'Item not found in cart' });
        }

        item.quantity = quantity;
        item.price = finalPrice;
        item.total = quantity * finalPrice;
        cart.cartTotal = cart.cartItem.reduce((total, i) => total + i.total, 0);

        await cart.save();
        res.json({ message: 'Cart updated successfully', cartTotal: cart.cartTotal });
    } catch (error) {
        console.error('Error in updateCart:', error);
        res.status(500).json({ message: 'Error updating cart' });
    }
};

// Remove Product from Cart
exports.removeFromCart = async (req, res) => {
    try {
        const userId = req.session.user.id;
        if (!userId) {
            return res.status(401).json({ message: 'Please log in to remove items from cart' });
        }

        const { productId } = req.params;
        const cart = await Cart.findOne({ user: userId });

        if (!cart) {
            return res.status(404).json({ message: 'Cart not found' });
        }

        cart.cartItem = cart.cartItem.filter(
            (item) => item.productId.toString() !== productId
        );
        cart.cartTotal = cart.cartItem.reduce((total, item) => total + item.total, 0);

        await cart.save();
        return res.status(200).json({ message: 'Product removed from cart' });
    } catch (error) {
        console.error('Error in removeFromCart:', error);
        return res.status(500).json({ message: 'Error removing product from cart' });
    }
};

// Get Cart Item (Used for quantity validation)
exports.getCartItem = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { productId } = req.query;

        const cart = await Cart.findOne({ user: userId });
        if (!cart) {
            return res.status(404).json({ message: 'Cart not found' });
        }

        const item = cart.cartItem.find((i) => i.productId.toString() === productId);
        if (!item) {
            return res.status(404).json({ message: 'Item not found in cart' });
        }

        res.json({ quantity: item.quantity });
    } catch (error) {
        console.error('Error in getCartItem:', error);
        res.status(500).json({ message: 'Error fetching cart item' });
    }
};


// Get Cart Totals
exports.getCartTotals = async (req, res) => {
    try {
        const userId = req.session.user.id;
        console.log(`Fetching cart totals for user: ${userId}`);

        const cart = await Cart.findOne({ user: userId }).populate('cartItem.productId');
        if (!cart || !cart.cartItem || cart.cartItem.length === 0) {
            console.log(`Cart is empty or not found for user: ${userId}`);
            return res.status(400).json({
                success: false,
                message: 'Cart is empty',
                items: [],
            });
        }

        const items = [];
        const invalidProducts = [];

        // Validate cart items
        for (const item of cart.cartItem) {
            if (!item.productId) {
                console.log(`Invalid item: Product not found for item ${item._id}`);
                invalidProducts.push('Unknown product');
                continue;
            }
            if (item.quantity > item.productId.totalStock) {
                console.log(`Invalid item: Insufficient stock for ${item.productId.productName}`);
                invalidProducts.push(item.productId.productName);
                continue;
            }
            if (item.productId.isAvailable === false) {
                console.log(`Invalid item: ${item.productId.productName} is unavailable`);
                invalidProducts.push(item.productId.productName);
                continue;
            }
            items.push({
                productId: item.productId._id,
                productName: item.productId.productName,
                quantity: item.quantity,
                price: item.price,
                total: item.total,
                stock: item.productId.totalStock,
            });
        }

        if (items.length === 0) {
            console.log(`All cart items are invalid: ${invalidProducts.join(', ')}`);
            return res.status(400).json({
                success: false,
                message: `All items in cart are invalid: ${invalidProducts.join(', ')}`,
                items: [],
                invalidProducts,
            });
        }

        // Calculate totals
        let originalSubtotal = 0;
        let discountAmount = 0;
        cart.cartItem.forEach(item => {
            if (item.productId && item.productId.price) {
                const price = item.productId.price;
                originalSubtotal += price * item.quantity;
                const offer = getBestOffer(item.productId); // Use getBestOffer for consistency
                if (offer && offer.discount) {
                    discountAmount += (price * item.quantity * offer.discount) / 100;
                }
            }
        });

        // Apply coupon if present
        let couponDiscount = 0;
        if (req.session.appliedCoupon) {
            const coupon = await Coupon.findOne({ code: req.session.appliedCoupon, isActive: true });
            if (coupon && (!coupon.minPurchase || originalSubtotal >= coupon.minPurchase)) {
                if (coupon.discountType === 'percentage') {
                    couponDiscount = (originalSubtotal * coupon.discount) / 100;
                    if (coupon.maxDiscount && couponDiscount > coupon.maxDiscount) {
                        couponDiscount = coupon.maxDiscount;
                    }
                } else {
                    couponDiscount = coupon.discount;
                }
            } else {
                req.session.appliedCoupon = null; // Clear invalid coupon
            }
        }

        const shippingCharge = 100;
        const finalPrice = originalSubtotal - discountAmount - couponDiscount + shippingCharge;

        console.log(`Cart totals calculated:`, { originalSubtotal, discountAmount, couponDiscount, finalPrice });

        res.status(200).json({
            success: true,
            items,
            subtotal: originalSubtotal,
            discountAmount,
            couponDiscount,
            finalPrice,
            invalidProducts: invalidProducts.length > 0 ? invalidProducts : undefined,
        });
    } catch (error) {
        console.error('Error fetching cart totals:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch cart totals',
            error: error.message,
        });
    }
};

// Verify Cart Before Checkout
exports.verifyCartCheckout = async (req, res) => {
    try {
        const userId = req.session.user.id;
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(401).json({ valid: false, message: 'Invalid user ID' });
        }

        const cart = await Cart.findOne({ user: userId }).populate({
            path: 'cartItem.productId',
            populate: { path: 'category' },
        });

        if (!cart || !cart.cartItem || cart.cartItem.length === 0) {
            return res.status(400).json({ valid: false, message: 'Cart is empty or not found' });
        }

        const invalidProducts = [];
        for (const item of cart.cartItem) {
            const product = item.productId;
            if (
                !product ||
                !product.status ||
                !product.category ||
                !product.category.status ||
                product.totalStock < item.quantity
            ) {
                invalidProducts.push(product?.productName || 'Unknown Product');
            }
        }

        if (invalidProducts.length > 0) {
            return res.status(400).json({
                valid: false,
                message: 'Some products in your cart are unavailable or out of stock',
                invalidProducts,
            });
        }

        res.json({ valid: true });
    } catch (error) {
        console.error('Error in verifyCartCheckout:', error);
        res.status(500).json({ valid: false, message: `Error verifying cart: ${error.message}` });
    }
};
