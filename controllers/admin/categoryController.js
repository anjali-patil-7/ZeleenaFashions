const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');
const { processImage, deleteImage } = require('../../helpers/imageHelper');
const { body, validationResult } = require('express-validator');
const path = require("path")

// Validation middleware for postAddCategory
exports.validateAddCategory = [
    body('name')
        .trim()
        .notEmpty()
        .withMessage('Category name is required')
        .isLength({ min: 2, max: 50 })
        .withMessage('Name must be 2-50 characters long')
        .matches(/^[a-zA-Z\s]+$/)
        .withMessage('Name should only contain letters and spaces, no numbers allowed'),
    body('description')
        .trim()
        .notEmpty()
        .withMessage('Description is required')
        .isLength({ min: 10, max: 500 })
        .withMessage('Description must be 10-500 characters long')
        .matches(/^[a-zA-Z\s]+$/)
        .withMessage('Description should only contain letters and spaces, no numbers allowed'),
];

// Get all categories with search, sort, and pagination
exports.getCategories = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const searchQuery = req.query.query || '';
        const sortBy = req.query.sortBy || 'createdAt';
        const sortOrder = req.query.sortOrder || 'desc';

        let query = {};
        if (searchQuery) {
            query = {
                $or: [
                    { name: { $regex: searchQuery, $options: 'i' } },
                    { description: { $regex: searchQuery, $options: 'i' } }
                ]
            };
        }

        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

        const totalCategories = await Category.countDocuments(query);
        const categories = await Category.find(query)
            .sort(sortOptions)
            .skip((page - 1) * limit)
            .limit(limit);

        res.render('admin/categories', {
            categories,
            currentPage: page,
            totalPages: Math.ceil(totalCategories / limit),
            searchQuery,
            sortBy,
            sortOrder,
            messages: { error: req.flash('error'), success: req.flash('success') },
            breadcrumbs: [
                { name: 'Home', url: '/admin' },
                { name: 'Categories', url: '/admin/categories' }
            ]
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Failed to load categories');
        res.status(500).render('admin/categories', {
            categories: [],
            currentPage: 1,
            totalPages: 1,
            searchQuery: '',
            sortBy: 'createdAt',
            sortOrder: 'desc',
            messages: { error: req.flash('error'), success: req.flash('success') },
            breadcrumbs: [
                { name: 'Home', url: '/admin' },
                { name: 'Categories', url: '/admin/categories' }
            ]
        });
    }
};

// Render add category form
exports.getAddCategory = (req, res) => {
    res.render('admin/addcategory', {
        name: '',
        description: '',
        messages: { error: req.flash('error'), success: req.flash('success') },
        breadcrumbs: [
            { name: 'Home', url: '/admin' },
            { name: 'Categories', url: '/admin/categories' },
            { name: 'Add Category', url: '/admin/addcategory' }
        ]
    });
};

// Add new category
exports.postAddCategory = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.flash('error', errors.array().map(err => err.msg).join(', '));
            return res.render('admin/addcategory', {
                name: req.body.name || '',
                description: req.body.description || '',
                messages: { error: req.flash('error'), success: req.flash('success') },
                breadcrumbs: [
                    { name: 'Home', url: '/admin' },
                    { name: 'Categories', url: '/admin/categories' },
                    { name: 'Add Category', url: '/admin/addcategory' }
                ]
            });
        }

        if (!req.file) {
            req.flash('error', 'Category image is required');
            return res.render('admin/addcategory', {
                name: req.body.name || '',
                description: req.body.description || '',
                messages: { error: req.flash('error'), success: req.flash('success') },
                breadcrumbs: [
                    { name: 'Home', url: '/admin' },
                    { name: 'Categories', url: '/admin/categories' },
                    { name: 'Add Category', url: '/admin/addcategory' }
                ]
            });
        }

        const existingCategory = await Category.findOne({ name: req.body.name });
        if (existingCategory) {
            req.flash('error', 'Category name already exists');
            return res.render('admin/addcategory', {
                name: req.body.name || '',
                description: req.body.description || '',
                messages: { error: req.flash('error'), success: req.flash('success') },
                breadcrumbs: [
                    { name: 'Home', url: '/admin' },
                    { name: 'Categories', url: '/admin/categories' },
                    { name: 'Add Category', url: '/admin/addcategory' }
                ]
            });
        }

        const imageName = await processImage(req.file);
        const category = new Category({
            name: req.body.name,
            description: req.body.description,
            image: imageName,
            status: true
        });

        await category.save();
        req.flash('success', 'Category added successfully');
        res.redirect('/admin/categories');
    } catch (error) {
        console.error(error);
        req.flash('error', 'Failed to add category');
        res.render('admin/addcategory', {
            name: req.body.name || '',
            description: req.body.description || '',
            messages: { error: req.flash('error'), success: req.flash('success') },
            breadcrumbs: [
                { name: 'Home', url: '/admin' },
                { name: 'Categories', url: '/admin/categories' },
                { name: 'Add Category', url: '/admin/addcategory' }
            ]
        });
    }
};

// Render edit category form
exports.getEditCategory = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        if (!category) {
            req.flash('error', 'Category not found');
            return res.redirectDeferred('/admin/categories');
        }
        res.render('admin/editcategory', {
            category,
            messages: { error: req.flash('error'), success: req.flash('success') },
            breadcrumbs: [
                { name: 'Home', url: '/admin' },
                { name: 'Categories', url: '/admin/categories' },
                { name: 'Edit Category', url: `/admin/editcategory/${req.params.id}` }
            ]
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Failed to load category');
        res.redirect('/admin/categories');
    }
};

// Update category
exports.updateCategory = async (req, res) => {
    try {
        const { name, description } = req.body;
        const id = req.params.id;
        const uploadDir = path.join(__dirname, '../../public/uploads/categories'); // your image folder

        if (!name || !description) {
            req.flash('error', 'Name and description are required');
            return res.redirect(`/admin/editCategory/${id}`);
        }

        const updateData = { name, description };

        if (req.file) {
            const category = await Category.findById(id);
            if (category.image) {
                await deleteImage(category.image, uploadDir); // pass uploadDir here
            }
            updateData.image = await processImage(req.file, uploadDir); // pass uploadDir here
        }

        await Category.findByIdAndUpdate(id, updateData);
        req.flash('success', 'Category updated successfully');
        res.redirect('/admin/categories');
    } catch (error) {
        console.error(error);
        req.flash('error', 'Failed to update category');
        res.redirect(`/admin/editCategory/${req.params.id}`);
    }
};

// Toggle category status
exports.toggleCategoryStatus = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }

        category.status = !category.status;
        await category.save();

        res.json({
            status: category.status,
            message: `Category ${category.status ? 'unblocked' : 'blocked'} successfully`
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update category status' });
    }
};

// Delete category with enhanced error handling
exports.deleteCategory = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }

        // Check if category is associated with any products
        const products = await Product.find({ category: req.params.id });
        if (products.length > 0) {
            return res.status(400).json({
                error: 'Cannot delete category. It is associated with one or more products.'
            });
        }

        // Delete associated image
        if (category.image) {
            try {
                await deleteImage(category.image);
            } catch (imageError) {
                console.error('Image deletion error:', imageError);
                return res.status(500).json({
                    error: 'Failed to delete category image'
                });
            }
        }

        await Category.findByIdAndDelete(req.params.id);
        return res.json({
            message: 'Category deleted successfully'
        });
    } catch (error) {
        console.error('Delete category error:', error);
        return res.status(500).json({
            error: 'Failed to delete category. Please try again later.'
        });
    }
};