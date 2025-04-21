const express = require('express');
const authController = require('../controllers/admin/adminController');
const categoryController = require('../controllers/admin/categoryController');
const productController = require('../controllers/admin/productController');
const userController = require('../controllers/admin/userController');
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
        req.flash('success_msg', 'Successfully logged out');
        res.redirect('/admin/login');
    });
});

// Protected routes 
router.get('/index', authController.getDashboard);

// Category routes
router.get('/categories',  categoryController.getCategories);
router.get('/addcategory', categoryController.getAddCategory);
router.post('/addcategory', categoryUpload.single('image'), categoryController.validateAddCategory, categoryController.postAddCategory);
router.get('/editcategory/:id', categoryController.getEditCategory);
router.post('/editcategory/:id',  categoryUpload.single('image'), categoryController.updateCategory);
router.post('/toggleCategory/:id',  categoryController.toggleCategoryStatus);
router.delete('/deleteCategory/:id', categoryController.deleteCategory);

// Product routes
router.get('/product', productController.getProducts);
router.get('/addproduct', productController.renderAddProduct);
router.post('/addproduct',  productUpload.array('images', 3), productController.addProduct);
router.get('/editproduct/:id', productController.renderEditProduct);
router.post('/editproduct/:id', productUpload.array('images', 3), productController.editProduct);
router.post('/api/blockproduct/:id', productController.toggleProductStatus);

// User routes
router.get('/users', userController.getUsers);
router.post('/api/block/:userId', userController.toggleUserStatus);

module.exports = router;