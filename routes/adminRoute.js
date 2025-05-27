// routes/adminRoutes.js
const express = require('express');
const authController = require('../controllers/admin/adminController');
const categoryController = require('../controllers/admin/categoryController (6)');
const productController = require('../controllers/admin/productController');
const userController = require('../controllers/admin/userController');
const orderController = require('../controllers/admin/orderControoler')
const couponController = require('../controllers/admin/couponController')
const offerController = require('../controllers/admin/offerController')
const saleController = require('../controllers/admin/saleController')
const adminSession = require('../middlewares/admin');
const { categoryUpload, productUpload } = require('../config/multer');
const router = express.Router();

// Authentication routes
router.get('/login', authController.getLogin);
router.post('/login', authController.adminLogin);
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destruction error:', err);
      req.flash('error_msg', 'Error logging out');
      return res.redirect('/admin/index');
    }
    // req.flash('success_msg', 'Successfully logged out');
    res.redirect('/admin/login');
  });
});

// Protected routes
router.get('/index', adminSession, authController.getDashboard);
router.get('/categories', adminSession, categoryController.getCategories);
router.get('/addcategory', adminSession, categoryController.getAddCategory);
router.post('/addcategory', adminSession, categoryUpload.single('image'), categoryController.validateAddCategory, categoryController.postAddCategory);

// Category routes
router.get('/categories',adminSession,categoryController.getCategories);
router.get('/addcategory',adminSession, categoryController.getAddCategory);
router.post('/addcategory',adminSession, categoryUpload.single('image'), categoryController.validateAddCategory, categoryController.postAddCategory);
router.get('/editcategory/:id',adminSession, categoryController.getEditCategory);
router.post('/editcategory/:id',adminSession, categoryUpload.single('image'), categoryController.updateCategory);
router.post('/toggleCategory/:id',adminSession, categoryController.toggleCategoryStatus);
router.delete('/deleteCategory/:id',adminSession, categoryController.deleteCategory);

// Product routes
router.get('/product',adminSession, productController.getProducts);
router.get('/addproduct',adminSession, productController.renderAddProduct);
router.post('/addproduct', adminSession, productUpload.array('images', 3), productController.addProduct);
router.delete('/api/deleteproduct/:id', adminSession, productController.deleteProduct);
router.get('/editproduct/:id', adminSession, productController.renderEditProduct);
router.post('/editproduct/:id', adminSession, productUpload.array('images', 3), productController.editProduct);
router.post('/api/blockproduct/:id',adminSession, productController.toggleProductStatus);

// User routes
router.get('/users',adminSession, userController.getUsers);
router.post('/api/block/:userId',adminSession, userController.toggleUserStatus);


//order Route
router.get('/orders',adminSession,orderController.getOrders)
router.get('/orders/:id', adminSession,orderController.getOrderDetails)
router.post('/orders/update-status', orderController.updateOrderStatus);
router.post('/orders/update-product-status', orderController.updateProductStatus);
router.post('/orders/update-payment-status', orderController.updatePaymentStatus);
router.post('/orders/verify-return', orderController.verifyReturn);


//Coupon routes
router.get('/coupon',adminSession,couponController.getCoupons)
router.get('/addcoupon',adminSession,couponController.getAddCoupon)
router.post('/addcoupon',adminSession,couponController.postAddCoupon)
router.get('/editcoupon/:id',adminSession,couponController.getEditCoupon)
router.post('/editcoupon/:id',adminSession,couponController.postEditCoupon)
router.put('/api/blockcoupon/:id',adminSession,couponController.blockCoupon)

// Offer management routes
router.get('/offer', adminSession, offerController.getOfferList);
router.get('/addoffer',adminSession, offerController.getAddOffer);
router.post('/addoffer',adminSession, offerController.postAddOffer);
router.get('/editoffer/:id',adminSession, offerController.getEditOffer);
router.post('/editoffer/:id',adminSession, offerController.postEditOffer);
router.put('/api/blockoffer/:id',adminSession, offerController.blockOffer);

//sales Report route
router.get('/sales/:period', adminSession,saleController.getSalesReport);
router.post('/customdate', adminSession,saleController.getCustomDateReport);
router.get('/checkDataExist',adminSession, saleController.checkDataExist);

module.exports = router;