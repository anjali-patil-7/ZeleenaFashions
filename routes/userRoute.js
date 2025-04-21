const express = require('express');
const authController = require('../controllers/user/authController');
const homeController = require('../controllers/user/homeController');
const shopController = require('../controllers/user/shopController');
const profileController = require('../controllers/user/profileController');
const { verifyToken } = require('../middlewares/auth');

const router = express.Router();

router.get('/', homeController.getHomePage);

router.get('/register', authController.getSignup);
router.post('/register', authController.postSignup);
router.get('/login', authController.getLogin);
router.post('/login', authController.postLogin);
router.get('/verify-otp', authController.verifyOTP);
router.post('/verify-otp', authController.verifyOTP);
router.post('/resend-otp', authController.resendOTP);
// router.get('/google', authController.googleAuth);
router.get('/auth/google',authController.googleAuth)
router.get('/auth/google/callback',authController.googleCallback)
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


module.exports = router;