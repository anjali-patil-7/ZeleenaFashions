// routes/adminRoutes.js
const express = require('express');
const authController = require('../controllers/admin/adminController');
const categoryController = require('../controllers/admin/categoryController (6)');
const productController = require('../controllers/admin/productController');
const userController = require('../controllers/admin/userController');
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
http://localhost:3000/admin/categories
// Product routes
router.get('/product',adminSession, productController.getProducts);
router.get('/addproduct',adminSession, productController.renderAddProduct);
router.post('/addproduct', adminSession, productUpload.array('images', 3), productController.addProduct);

router.get('/editproduct/:id', adminSession, productController.renderEditProduct);
router.post('/editproduct/:id', adminSession, productUpload.array('images', 3), productController.editProduct);
router.post('/api/blockproduct/:id',adminSession, productController.toggleProductStatus);

// User routes
router.get('/users',adminSession, userController.getUsers);
router.post('/api/block/:userId',adminSession, userController.toggleUserStatus);

// Catch-all route for undefined admin routes
router.use((req, res) => {
  res.status(404).render('admin/404');
});

// Error handling middleware for admin routes
router.use((err, req, res, next) => {
  console.error('Admin route error:', err);
  req.flash('error_msg', 'Something went wrong');
  res.status(500).render('admin/404');
});

module.exports = router;