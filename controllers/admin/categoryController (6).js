const Category = require('../../models/categorySchema');
const path = require('path');
const fs = require('fs');

// Render add category page
exports.getAddCategory = (req, res) => {
    res.render('admin/addcategory', {
        messages: {},
        name: '',
        description: '',
        breadcrumbs: [
            { name: 'Home', url: '/admin/dashboard' },
            { name: 'Categories', url: '/admin/categories' },
            { name: 'Add Category' }
        ]
    });
};

// Middleware to validate add category input
exports.validateAddCategory = async (req, res, next) => {
    try {
        const { name, description } = req.body;

        // Validate required fields
        if (!name || !description) {
            return res.status(400).render('admin/addcategory', {
                messages: { error: 'Name and description are required' },
                name: name || '',
                description: description || '',
                breadcrumbs: [
                    { name: 'Home', url: '/admin/dashboard' },
                    { name: 'Categories', url: '/admin/categories' },
                    { name: 'Add Category' }
                ]
            });
        }

        // Normalize the name by trimming whitespace
        const trimmedName = name.trim();

       
         // Check for existing category (case-insensitive)
        const existingCategory = await Category.findOne({
            name: { $regex: new RegExp(`^${trimmedName}$`, 'i') },
            status: true
        });

        if (existingCategory) {
            return res.status(400).render('admin/addcategory', {
                messages: { error: 'A category with this name already exists (case-insensitive)' },
                name: trimmedName,
                description,
                breadcrumbs: [
                    { name: 'Home', url: '/admin/dashboard' },
                    { name: 'Categories', url: '/admin/categories' },
                    { name: 'Add Category' }
                ]
            });
        }

        // Store trimmed name in request body for consistency
        req.body.name = trimmedName;
        next();
    } catch (error) {
        console.error(error);
        res.status(500).render('admin/addcategory', {
            messages: { error: 'An error occurred while validating the category.' },
            name: req.body.name || '',
            description: req.body.description || '',
            breadcrumbs: [
                { name: 'Home', url: '/admin/dashboard' },
                { name: 'Categories', url: '/admin/categories' },
                { name: 'Add Category' }
            ]
        });
    }
};

// Handle add category form submission
exports.postAddCategory = async (req, res) => {
    try {
        const { name, description, croppedImageData } = req.body;
        let imagePath = '';
        if (croppedImageData) {
            const base64Data = croppedImageData.replace(/^data:image\/\w+;base64,/, '');
            const imageBuffer = Buffer.from(base64Data, 'base64');
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            imagePath = `category-${uniqueSuffix}.jpg`;
            fs.writeFileSync(path.join(__dirname, '../public/uploads/categories', imagePath), imageBuffer);
        } else if (req.file) {
            imagePath = req.file.filename;
        }

        const category = new Category({
            name: name.trim(),
            description,
            image: imagePath,
            status: true,
            isDeleted:false
        });

        await category.save();
        req.flash('success', 'Category added successfully!');
        res.redirect(302, '/admin/categories');
    } catch (error) {
        console.error(error);
        res.status(500).render('admin/addcategory', {
            messages: { error: 'An error occurred while adding the category.' },
            name: req.body.name || '',
            description: req.body.description || '',
            breadcrumbs: [
                { name: 'Home', url: '/admin/dashboard' },
                { name: 'Categories', url: '/admin/categories' },
                { name: 'Add Category' }
            ]
        });
    }
};

// Render edit category page
exports.getEditCategory = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        if (!category) {
            return res.status(404).render('admin/editcategory', {
                messages: { error: 'Category not found' },
                category: { _id: req.params.id, name: '', description: '' },
                breadcrumbs: [
                    { name: 'Home', url: '/admin/dashboard' },
                    { name: 'Categories', url: '/admin/categories' },
                    { name: 'Edit Category' }
                ]
            });
        }
        res.render('admin/editcategory', {
            category,
            messages: {},
            breadcrumbs: [
                { name: 'Home', url: '/admin/dashboard' },
                { name: 'Categories', url: '/admin/categories' },
                { name: 'Edit Category' }
            ]
        });
    } catch (error) {
        console.error(error);
        res.status(500).render('admin/editcategory', {
            messages: { error: 'Error fetching category' },
            category: { _id: req.params.id, name: '', description: '' },
            breadcrumbs: [
                { name: 'Home', url: '/admin/dashboard' },
                { name: 'Categories', url: '/admin/categories' },
                { name: 'Edit Category' }
            ]
        });
    }
};

// Update category
exports.updateCategory = async (req, res) => {
    try {
        const { id, name, description, croppedImageData } = req.body;
        const category = await Category.findById(id);
        if (!category) {
            req.flash('error', 'Category not found');
            return res.status(404).render('admin/editcategory', {
                messages: req.flash(),
                category: { _id: id, name: name || '', description: description || '' },
                breadcrumbs: [
                    { name: 'Home', url: '/admin/dashboard' },
                    { name: 'Categories', url: '/admin/categories' },
                    { name: 'Edit Category' }
                ]
            });
        }

        // Normalize the name by trimming whitespace
        const trimmedName = name.trim();

        // Check for existing category (case-insensitive, excluding current category)
        const existingCategory = await Category.findOne({
            name: { $regex: new RegExp(`^${trimmedName}$`, 'i') },
            _id: { $ne: id } // Exclude the current category
        });

        if (existingCategory) {
            req.flash('error', 'A category with this name already exists (case-insensitive)');
            return res.status(400).render('admin/editcategory', {
                messages: req.flash(),
                category: { _id: id, name: trimmedName, description, image: category.image },
                breadcrumbs: [
                    { name: 'Home', url: '/admin/dashboard' },
                    { name: 'Categories', url: '/admin/categories' },
                    { name: 'Edit Category' }
                ]
            });
        }

        // Update category fields
        category.name = trimmedName;
        category.description = description;

        // Handle image update
        let imagePath = category.image; // Retain existing image if no new image
        if (croppedImageData) {
            const base64Data = croppedImageData.replace(/^data:image\/\w+;base64,/, '');
            const imageBuffer = Buffer.from(base64Data, 'base64');
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            imagePath = `category-${uniqueSuffix}.jpg`;
            fs.writeFileSync(path.join(__dirname, '../public/Uploads/categories', imagePath), imageBuffer);

            // Delete old image if it exists
            if (category.image) {
                const oldImagePath = path.join(__dirname, '../public/Uploads/categories', category.image);
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                }
            }
            category.image = imagePath;
        } else if (req.file) {
            // Delete old image if it exists
            if (category.image) {
                const oldImagePath = path.join(__dirname, '../public/Uploads/categories', category.image);
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                }
            }
            category.image = req.file.filename;
        }

        await category.save();
        req.flash('success', 'Category updated successfully!');
        res.redirect(302, '/admin/categories');
    } catch (error) {
        console.error(error);
        req.flash('error', 'An error occurred while updating the category.');
        res.status(500).render('admin/editcategory', {
            messages: req.flash(),
            category: { _id: req.body.id, name: req.body.name || '', description: req.body.description || '' },
            breadcrumbs: [
                { name: 'Home', url: '/admin/dashboard' },
                { name: 'Categories', url: '/admin/categories' },
                { name: 'Edit Category' }
            ]
        });
    }
};

// List categories
exports.getCategories = async (req, res) => {
    try {
        const { query = '', page = 1, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        const limit = 10;
        const skip = (page - 1) * limit;

        // Modified searchQuery to exclude soft-deleted categories
        const searchQuery = {
            isDeleted: false, // Only fetch categories that are not soft-deleted
            ...(query ? {
                $or: [
                    { name: { $regex: query, $options: 'i' } },
                    { description: { $regex: query, $options: 'i' } }
                ]
            } : {})
        };

        const categories = await Category.find(searchQuery)
            .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
            .skip(skip)
            .limit(limit);
        console.log("Category Details>>>>",categories)
        const totalCategories = await Category.countDocuments(searchQuery);
        const totalPages = Math.ceil(totalCategories / limit);

        res.render('admin/categories', {
            categories,
            currentPage: parseInt(page),
            totalPages,
            searchQuery: query,
            sortBy,
            sortOrder,
            breadcrumbs: [
                { name: 'Home', url: '/admin/dashboard' },
                { name: 'Categories' }
            ]
        });
    } catch (error) {
        console.error(error);
        res.status(500).render('admin/categories', {
            messages: { error: 'An error occurred while fetching categories.' },
            categories: [],
            currentPage: 1,
            totalPages: 1,
            searchQuery: '',
            sortBy: 'createdAt',
            sortOrder: 'desc',
            breadcrumbs: [
                { name: 'Home', url: '/admin/dashboard' },
                { name: 'Categories' }
            ]
        });
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
        res.json({ status: category.status });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while toggling category status' });
    }
};

// Delete category
exports.deleteCategory = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }
        category.isDeleted = true
        await category.save()

        res.json({message : 'Category deleted successfully'})
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while deleting the category' });
    }
};