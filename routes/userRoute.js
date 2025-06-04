const express = require('express');
const authController = require('../controllers/user/authController');
const homeController = require('../controllers/user/homeController');
const shopController = require('../controllers/user/shopController');
const profileController = require('../controllers/user/profileController');
const addressController = require('../controllers/user/addressController');
const CartController = require('../controllers/user/CartController');
const wishlistController = require('../controllers/user/wishlistController');
const checkoutController = require('../controllers/user/checkoutController');
const orderController = require('../controllers/user/OrderController');
const paymentController = require('../controllers/user/PaymentController');
const { verifySession, ifLogged, logged } = require('../middlewares/auth'); // Updated middleware import

const router = express.Router();

// Public routes
router.get('/', homeController.getHomePage);
router.get('/about', homeController.getAboutPage);
router.get('/contact', homeController.getContactPage);


// Shop routes
router.get('/shop', shopController.getShopPage);
router.get('/shopbyfilter/:categoryId', shopController.getShopByFilter);
router.get('/singleproduct/:id', shopController.getSingleProduct);


// Authentication routes
router.get('/register', ifLogged, authController.getSignup);
router.post('/register', authController.postSignup); // Note: ifLogged removed to allow form submission
router.get('/login', ifLogged, authController.getLogin);
router.post('/login', authController.postLogin); // Note: ifLogged removed to allow form submission
router.get('/verify-otp', authController.verifyOTP);
router.post('/verify-otp', authController.verifyOTP);
router.post('/resend-otp', authController.resendOTP);
router.get('/auth/google', authController.googleAuth);
router.get('/auth/google/callback', authController.googleCallback);
router.get('/logout', authController.logout);

// Forgot password routes
router.get('/forgot', authController.getForgotPassword);
router.post('/forgot', authController.postForgotPassword);
router.get('/verifyforgotpasswordotp', authController.verifyForgotPasswordOTP);
router.post('/verifyforgotpasswordotp', authController.verifyForgotPasswordOTP);
router.post('/resend-forgot-otp', authController.resendForgotPasswordOTP);
router.get('/reset-password', authController.resetPassword);
router.post('/reset-password', authController.resetPassword);

// Profile routes
router.get('/profile', verifySession, profileController.getProfile);
router.post('/updateprofile', verifySession, profileController.updateProfile);

// Change password
router.get('/changepassword', verifySession, (req, res) => {
    res.render('user/changepassword', {
        session: req.session || {},
        error_msg: req.flash('error_msg') || '',
        success_msg: req.flash('success_msg') || ''
    });
});
router.post('/changepassword', verifySession, authController.changePassword);

// Address routes
router.get('/address', verifySession, addressController.getAddresses);
router.get('/createaddress', verifySession, addressController.getAddressForm);
router.post('/createaddress', verifySession, addressController.createAddress);
router.get('/address/edit/:id', verifySession, addressController.getEditAddress);
router.post('/address/update/:id', verifySession, addressController.updateAddress);
router.post('/address/default/:id', verifySession, addressController.setDefaultAddress);
router.post('/address/delete/:id', verifySession, addressController.deleteAddress);

// Cart routes
router.get('/cart', verifySession, CartController.getCart);
router.post('/addtocart/:productId', verifySession, CartController.addToCart);
router.post('/update-cart', verifySession, CartController.updateCart);
router.delete('/remove/:productId', verifySession, CartController.removeFromCart);
router.get('/get-cart-item', verifySession, CartController.getCartItem);
router.get('/get-cart-totals', verifySession, CartController.getCartTotals);

// Wishlist routes
router.get('/wishlist', verifySession, wishlistController.getWishlist);
router.post('/wishlist/add', verifySession, wishlistController.addToWishlist);
router.post('/wishlist/remove', verifySession, wishlistController.removeFromWishlist);
router.post('/wishlist/add-to-cart', verifySession, wishlistController.addToCartFromWishlist);

// Checkout routes
router.get('/checkout', verifySession, checkoutController.getCheckoutPage);
router.post('/select-address', verifySession, checkoutController.selectAddress);
router.get('/confirmorder/:orderId', verifySession, checkoutController.getOrderConfirmation);
router.post('/apply-coupon', verifySession, checkoutController.applyCoupon);
router.post('/remove-coupon', verifySession, checkoutController.removeCoupon);
router.get('/validate-cart', verifySession, checkoutController.verifyCartBeforeCheckout);
router.get('/verify-cart-checkout', verifySession, checkoutController.verifyCartBeforeCheckout);

// Order routes
router.get('/orders', verifySession, orderController.getOrders);
router.get('/orderdetails/:orderId', verifySession, orderController.getOrderDetails);
router.post('/:orderId/cancel', verifySession, orderController.cancelOrder);
router.get('/orders/:orderId/invoice', verifySession, orderController.downloadInvoice);
router.post('/orders/:orderId/return', verifySession, orderController.requestReturn);
router.post('/orders/:orderId/cancel', verifySession, orderController.cancelOrder);
router.post('/orders/:orderId/cancel-product/:productId', verifySession, orderController.cancelSingleProduct);

// Wallet history
router.get('/walletHistory', verifySession, profileController.getWalletHistory);

// Payment routes
router.post('/create-razorpay-order', verifySession, paymentController.createRazorpayOrder);
router.post('/verify-payment', verifySession, paymentController.verifyPayment);
router.post('/place-order', verifySession, paymentController.placeOrder);
router.post('/retry-payment', verifySession, paymentController.retryPayment);
router.post('/handle-payment-failure', verifySession, paymentController.handlePaymentFailure);

module.exports = router;