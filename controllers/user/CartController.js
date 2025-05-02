const mongoose = require("mongoose");
const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Wishlist = require('../../models/wishlistSchema'); // Added Wishlist import

// List Products in Cart
exports.getCart = async (req, res) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(401).json({ message: 'Please log in to view your cart' });
    }

    const cartDetails = await Cart.findOne({ user: userId }).populate({
      path: 'cartItem.productId',
      populate: { path: 'category' },
    });

    console.log("cartDetails >>>>>", cartDetails);

    res.render('user/cart', {
      cartDetails: cartDetails || { cartItem: [], cartTotal: 0 },
      appliedOffers: {},
      error_msg: req.flash('error_msg'),
      success_msg: req.flash('success_msg'),
    });
  } catch (error) {
    console.error('Error in getCart:', error);
    req.flash('error_msg', 'Error loading cart');
    res.redirect('/shop');
  }
};

// Add to Cart
exports.addToCart = async (req, res) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(401).json({ message: 'Please log in to add items to cart' });
    }

    const { productId } = req.params;
    const { quantity = 1 } = req.body;

    // Validate productId
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }

    const product = await Product.findById(productId).populate('category');
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Log product and category details
    console.log('Product details:', {
      productId,
      productName: product.productName,
      isListed: product.isListed,
      totalStock: product.totalStock,
      category: product.category ? {
        id: product.category._id,
        name: product.category.name,
        isListed: product.category.isListed
      } : 'No category'
    });

    // Check if category is populated
    if (!product.category) {
      console.error('Category not found for product:', productId);
      return res.status(400).json({ message: 'Product category is missing' });
    }

    // Check if product or its category is blocked/unlisted
    if (!product.isListed || !product.category.isListed) {
      console.log('Availability check failed:', {
        productId,
        productIsListed: product.isListed,
        categoryId: product.category._id,
        categoryIsListed: product.category.isListed,
      });
      return res.status(400).json({ message: 'This product is not available' });
    }

    // Check stock availability
    if (product.totalStock < quantity) {
      return res.status(400).json({ message: `Only ${product.totalStock} items available in stock` });
    }

    // Check max quantity limit
    if (quantity > 7) {
      return res.status(400).json({ message: 'Maximum quantity per product is 7' });
    }

    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
      cart = new Cart({
        user: userId,
        cartItem: [],
        cartTotal: 0,
      });
    }

    const existingItem = cart.cartItem.find(
      (item) => item.productId.toString() === productId
    );

    if (existingItem) {
      const newQuantity = existingItem.quantity + parseInt(quantity);
      if (newQuantity > product.totalStock) {
        return res.status(400).json({ message: `Only ${product.totalStock} items available in stock` });
      }
      if (newQuantity > 7) {
        return res.status(400).json({ message: 'Maximum quantity per product is 7' });
      }
      existingItem.quantity = newQuantity;
      existingItem.total = existingItem.quantity * product.price;
    } else {
      cart.cartItem.push({
        productId,
        quantity: parseInt(quantity),
        price: product.price,
        stock: product.totalStock,
        total: product.price * quantity,
      });
    }

    cart.cartTotal = cart.cartItem.reduce((total, item) => total + item.total, 0);

    await cart.save();

    // Remove product from wishlist if it exists
    try {
      await Wishlist.updateOne(
        { userId },
        { $pull: { wishlistItems: { productId } } }
      );
    } catch (wishlistError) {
      console.error('Wishlist update failed, continuing without error:', wishlistError);
      // Continue even if wishlist update fails
    }

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
    const userId = req.user.id;
    if (!userId) {
      return res.status(401).json({ message: 'Please log in' });
    }

    const { productId, quantity } = req.body;
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

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
    item.total = quantity * product.price;
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
    const userId = req.user.id;
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
    const userId = req.user.id;
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
    const userId = req.user.id;
    const cart = await Cart.findOne({ user: userId }).populate('cartItem.productId');

    if (!cart) {
      return res.json({ originalTotal: 0, discountedTotal: 0 });
    }

    const total = cart.cartItem.reduce(
      (sum, item) => sum + item.quantity * item.productId.price,
      0
    );

    res.json({ originalTotal: total, discountedTotal: total });
  } catch (error) {
    console.error('Error in getCartTotals:', error);
    res.status(500).json({ message: 'Error fetching cart totals' });
  }
};

// Verify Cart Before Checkout
exports.verifyCartCheckout = async (req, res) => {
  try {
    const userId = req.user.id;
    const cart = await Cart.findOne({ user: userId }).populate({
      path: 'cartItem.productId',
      populate: { path: 'category' },
    });

    if (!cart || cart.cartItem.length === 0) {
      return res.json({ valid: false, message: 'Cart is empty' });
    }

    const invalidProducts = [];
    for (const item of cart.cartItem) {
      const product = item.productId;
      if (
        !product ||
        !product.isListed ||
        !product.category.isListed ||
        product.totalStock < item.quantity
      ) {
        invalidProducts.push(product?.productName || 'Unknown Product');
      }
    }

    if (invalidProducts.length > 0) {
      return res.json({
        valid: false,
        message: 'Some products in your cart are unavailable or out of stock',
        invalidProducts,
      });
    }

    res.json({ valid: true });
  } catch (error) {
    console.error('Error in verifyCartCheckout:', error);
    res.status(500).json({ valid: false, message: 'Error verifying cart' });
  }
};