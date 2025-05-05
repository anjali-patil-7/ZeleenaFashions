const express = require('express');
const authController = require('../controllers/user/authController');
const homeController = require('../controllers/user/homeController');
const shopController = require('../controllers/user/shopController');
const profileController = require('../controllers/user/profileController');
const addressController = require('../controllers/user/addressController');
const CartController = require('../controllers/user/CartController')
const wishlistController = require('../controllers/user/wishlistController')
const checkoutController = require('../controllers/user/checkoutController')
const orderController = require ('../controllers/user/OrderController')
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
router.get('/shop', verifyToken, shopController.getShopPage);
router.get('/shopbyfilter/:categoryId', verifyToken, shopController.getShopByFilter);
router.get('/singleproduct/:id', verifyToken, shopController.getSingleProduct);

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
router.post('/address/delete/:id',verifyToken,addressController.deleteAddress)

//cart route
router.get('/cart',verifyToken,CartController.getCart)
router.post('/addtocart/:productId',verifyToken, CartController.addToCart);
router.post('/update-cart',verifyToken, CartController.updateCart);
router.delete('/remove/:productId',verifyToken, CartController.removeFromCart);
router.get('/get-cart-item',verifyToken, CartController.getCartItem);
router.get('/get-cart-totals',verifyToken, CartController.getCartTotals);
router.get('/verify-cart-checkout',verifyToken,CartController.verifyCartCheckout);


router.get('/wishlist', verifyToken, wishlistController.getWishlist);
router.post('/wishlist/add', verifyToken, wishlistController.addToWishlist);
// Remove from wishlist
router.post('/wishlist/remove', verifyToken, wishlistController.removeFromWishlist);

// Add to cart from wishlist
router.post('/wishlist/add-to-cart',verifyToken, wishlistController.addToCartFromWishlist);
router.get('/checkout',verifyToken,checkoutController.getCheckoutPage)
router.post('/select-address',verifyToken,checkoutController.selectAddress)
router.get('/placingorder',verifyToken,checkoutController.getPlacingOrder)


router.get('/placingorder', verifyToken, checkoutController.getPlacingOrder);
router.get('/place-order', verifyToken, checkoutController.placeOrder);
router.get('/confirmorder/:orderId', verifyToken, checkoutController.getOrderConfirmation);
router.get('/orders', verifyToken, orderController.getOrders);
router.get('/orderdetails/:orderId', verifyToken, orderController.getOrderDetails);
router.post('/:orderId/cancel', verifyToken, orderController.cancelOrder);
router.get('/orders/:orderId/invoice',verifyToken, orderController.downloadInvoice);
router.post('/orders/:orderId/return', verifyToken, orderController.requestReturn);
// Cancel entire order
router.post('/orders/:orderId/cancel', verifyToken, orderController.cancelOrder);

// Cancel single product in an order
router.post('/orders/:orderId/cancel-product/:productId', verifyToken, orderController.cancelSingleProduct);

router.get('/walletHistory', verifyToken, profileController.getWalletHistory);


module.exports = router;