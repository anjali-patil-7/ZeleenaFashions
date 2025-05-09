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
const { verifyToken, ifLogged, logged } = require('../middlewares/auth');

const router = express.Router();

router.get('/', homeController.getHomePage);

router.get('/register', ifLogged, authController.getSignup);
router.post('/register', authController.postSignup);
router.get('/login', ifLogged, authController.getLogin);
router.post('/login', authController.postLogin);
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
router.get('/profile', verifyToken, profileController.getProfile);
router.post('/updateprofile', verifyToken, profileController.updateProfile);
router.get('/verify-email-update', verifyToken, profileController.getVerifyEmailUpdate);
router.post('/verify-email-update', verifyToken, profileController.verifyEmailOtp);

// Shop routes
router.get('/shop', shopController.getShopPage);
router.get('/shopbyfilter/:categoryId', shopController.getShopByFilter);
router.get('/singleproduct/:id', shopController.getSingleProduct);

// Change password
router.get('/changepassword', verifyToken, (req, res) => {
    res.render('user/changepassword', {
        session: req.session || {},
        error_msg: req.session.error_msg || '',
        success_msg: req.session.success_msg || ''
    });
});
router.post('/changepassword', verifyToken, authController.changePassword);

// Address routes
router.get('/address', verifyToken, addressController.getAddresses);
router.get('/createaddress', verifyToken, addressController.getAddressForm);
router.post('/createaddress', verifyToken, addressController.createAddress);
router.get('/address/edit/:id', verifyToken, addressController.getEditAddress);
router.post('/address/update/:id', verifyToken, addressController.updateAddress);
router.post('/address/default/:id', verifyToken, addressController.setDefaultAddress);
router.post('/address/delete/:id', verifyToken, addressController.deleteAddress);

// Cart routes
router.get('/cart', verifyToken, CartController.getCart);
router.post('/addtocart/:productId', verifyToken, CartController.addToCart);
router.post('/update-cart', verifyToken, CartController.updateCart);
router.delete('/remove/:productId', verifyToken, CartController.removeFromCart);
router.get('/get-cart-item', verifyToken, CartController.getCartItem);
router.get('/get-cart-totals', verifyToken, CartController.getCartTotals);

// Wishlist routes
router.get('/wishlist', verifyToken, wishlistController.getWishlist);
router.post('/wishlist/add', verifyToken, wishlistController.addToWishlist);
router.post('/wishlist/remove', verifyToken, wishlistController.removeFromWishlist);
router.post('/wishlist/add-to-cart', verifyToken, wishlistController.addToCartFromWishlist);

// Checkout routes
router.get('/checkout', verifyToken, checkoutController.getCheckoutPage);
router.post('/select-address', verifyToken, checkoutController.selectAddress);
router.get('/placingorder', verifyToken, checkoutController.getPlacingOrder);
router.get('/confirmorder/:orderId', verifyToken, checkoutController.getOrderConfirmation);
router.post('/apply-coupon', verifyToken, checkoutController.applyCoupon);
router.post('/remove-coupon', verifyToken, checkoutController.removeCoupon);
router.get('/validate-cart', verifyToken, checkoutController.validateCart);
router.get('/verify-cart-checkout', verifyToken, checkoutController.verifyCartBeforeCheckout);

// Order routes
router.get('/orders', verifyToken, orderController.getOrders);
router.get('/orderdetails/:orderId', verifyToken, orderController.getOrderDetails);
router.post('/:orderId/cancel', verifyToken, orderController.cancelOrder);
router.get('/orders/:orderId/invoice', verifyToken, orderController.downloadInvoice);
router.post('/orders/:orderId/return', verifyToken, orderController.requestReturn);
router.post('/orders/:orderId/cancel', verifyToken, orderController.cancelOrder);
router.post('/orders/:orderId/cancel-product/:productId', verifyToken, orderController.cancelSingleProduct);

// Wallet history
router.get('/walletHistory', verifyToken, profileController.getWalletHistory);

// Payment routes
router.post('/create-razorpay-order', verifyToken, paymentController.createRazorpayOrder);
router.post('/verify-payment', verifyToken, paymentController.verifyPayment);
router.post('/place-order', verifyToken, paymentController.placeOrder);
router.post('/retry-payment', verifyToken, paymentController.retryPayment);

// Order success/failure pages
router.get('/order-success/:orderId', verifyToken, orderController.renderSuccessPage);
router.get('/order-failure/:orderId', verifyToken, orderController.renderFailurePage);

module.exports = router;