const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const path = require('path');

// Add Product
exports.addProduct = async (req, res) => {
    try {
        const { name, description, price, stock, category } = req.body;
        const files = req.files;

        // Backend validation
        const errors = [];

        if (!name || name.trim().length < 2 || name.trim().length > 100) {
            errors.push('Product name must be 2-100 characters long');
        } else if (!/^[a-zA-Z\s]+$/.test(name.trim())) {
            errors.push('Product name should only contain letters and spaces, no numbers allowed');
        }

        if (!description || description.trim().length < 10 || description.trim().length > 1000) {
            errors.push('Description must be 10-1000 characters long');
        } else if (!/^[a-zA-Z\s]+$/.test(description.trim())) {
            errors.push('Description should only contain letters and spaces, no numbers allowed');
        }

        if (!price || isNaN(price) || parseFloat(price) <= 0 || parseFloat(price) > 1000000) {
            errors.push('Price must be between 0.01 and 1,000,000');
        }

        if (!stock || isNaN(stock) || parseInt(stock) < 0 || parseInt(stock) > 10000) {
            errors.push('Stock must be between 0 and 10,000');
        }

        if (!category) {
            errors.push('Category is required');
        }

        if (!files || files.length !== 3) {
            errors.push('Exactly 3 images are required');
        } else {
            const validExtensions = ['.jpg', '.jpeg', '.png'];
            const maxSize = 5 * 1024 * 1024; // 5MB
            files.forEach((file, index) => {
                const ext = path.extname(file.originalname).toLowerCase();
                if (!validExtensions.includes(ext)) {
                    errors.push(`Image ${index + 1} must be JPG, JPEG, or PNG`);
                }
                if (file.size > maxSize) {
                    errors.push(`Image ${index + 1} must be less than 5MB`);
                }
            });
        }

        if (errors.length > 0) {
            const categories = await Category.find();
            return res.render('admin/addproduct', {
                product: { name, description, price, stock, category },
                categories,
                errors,
                categoryData: categories,
                messages: { error: req.flash('error'), success: req.flash('success') }
            });
        }

        // Store image paths
        const imagePaths = files.map(file => `/uploads/products/${file.filename}`);

        // Create product
        const product = new Product({
            productName: name.trim(),
            description: description.trim(),
            price: parseFloat(price),
            totalStock: parseInt(stock),
            category,
            productImage: imagePaths,
            status: true
        });

        await product.save();
        console.log(`Product saved with images: ${imagePaths}`);

        req.flash('success', 'Product added successfully');
        res.redirect('/admin/product');
    } catch (error) {
        console.error('Error adding product:', error);
        const categories = await Category.find();
        req.flash('error', error.message || 'An error occurred while adding the product');
        res.render('admin/addproduct', {
            product: { name, description, price, stock, category },
            categories,
            errors: [error.message],
            categoryData: categories,
            messages: { error: req.flash('error'), success: req.flash('success') }
        });
    }
};

// Edit Product
// Edit Product
exports.editProduct = async (req, res) => {
    try {
        const { id, name, description, price, stock, category } = req.body;
        const files = req.files || []; // Handle case where no new images are uploaded
        const errors = [];

        if (!name || name.trim().length < 2 || name.trim().length > 100) {
            errors.push('Product name must be 2-100 characters long');
        } else if (!/^[a-zA-Z\s]+$/.test(name.trim())) {
            errors.push('Product name should only contain letters and spaces, no numbers allowed');
        }

        if (!description || description.trim().length < 10 || description.trim().length > 1000) {
            errors.push('Description must be 10-1000 characters long');
        } else if (!/^[a-zA-Z\s]+$/.test(description.trim())) {
            errors.push('Description should only contain letters and spaces, no numbers allowed');
        }

        if (!price || isNaN(price) || parseFloat(price) <= 0 || parseFloat(price) > 1000000) {
            errors.push('Price must be between 0.01 and 1,000,000');
        }

        if (!stock || isNaN(stock) || parseInt(stock) < 0 || parseInt(stock) > 10000) {
            errors.push('Stock must be between 0 and 10,000');
        }

        if (!category) {
            errors.push('Category is required');
        }

        // Validate new images if uploaded
        if (files.length > 0) {
            const validExtensions = ['.jpg', '.jpeg', '.png'];
            const maxSize = 5 * 1024 * 1024; // 5MB
            files.forEach((file, index) => {
                const ext = path.extname(file.originalname).toLowerCase();
                if (!validExtensions.includes(ext)) {
                    errors.push(`Image ${index + 1} must be JPG, JPEG, or PNG`);
                }
                if (file.size > maxSize) {
                    errors.push(`Image ${index + 1} must be less than 5MB`);
                }
            });

            if (files.length !== 3) {
                errors.push('Exactly 3 images are required when updating images');
            }
        }

        if (errors.length > 0) {
            const product = await Product.findById(id).populate('category');
            const categories = await Category.find();
            return res.render('admin/editproduct', {
                product,
                categories,
                errors,
                categoryData: categories,
                messages: { error: req.flash('error'), success: req.flash('success') }
            });
        }

        // Fetch the existing product
        const product = await Product.findById(id);
        if (!product) {
            req.flash('error', 'Product not found');
            return res.redirect('/admin/product');
        }

        // Define the upload directory for product images
        const uploadDir = path.join(__dirname, '../../public/uploads/products');

        // Process new images if uploaded
        let imagePaths = product.productImage; // Keep existing images by default
        if (files.length > 0) {
            // Delete old images
            const { deleteImage, processImage } = require('../../helpers/imagehelper');
            for (const imagePath of product.productImage) {
                const imageName = path.basename(imagePath);
                await deleteImage(imageName, uploadDir);
            }

            // Process and crop new images
            imagePaths = [];
            for (const file of files) {
                const imageName = await processImage(file, uploadDir);
                imagePaths.push(`/uploads/products/${imageName}`);
            }
        }

        // Update product
        await Product.findByIdAndUpdate(id, {
            productName: name.trim(),
            description: description.trim(),
            price: parseFloat(price),
            totalStock: parseInt(stock),
            category,
            productImage: imagePaths
        });

        req.flash('success', 'Product updated successfully');
        res.redirect('/admin/product');
    } catch (error) {
        console.error(error);
        const product = await Product.findById(req.body.id).populate('category');
        const categories = await Category.find();
        req.flash('error', 'An error occurred while updating the product');
        res.render('admin/editproduct', {
            product,
            categories,
            errors: [error.message],
            categoryData: categories,
            messages: { error: req.flash('error'), success: req.flash('success') }
        });
    }
};

// Get Products
exports.getProducts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const searchQuery = req.query.query || '';

        const query = searchQuery
            ? {
                  $or: [
                      { productName: { $regex: searchQuery, $options: 'i' } },
                      { description: { $regex: searchQuery, $options: 'i' } }
                  ]
              }
            : {};

        const products = await Product.find(query)
            .populate('category')
            .skip((page - 1) * limit)
            .limit(limit);

        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / limit);

        res.render('admin/product', {
            products,
            currentPage: page,
            totalPages,
            searchQuery,
            messages: { error: req.flash('error'), success: req.flash('success') }
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'An error occurred while fetching products');
        res.render('admin/product', {
            products: [],
            currentPage: 1,
            totalPages: 1,
            searchQuery: '',
            messages: { error: req.flash('error'), success: req.flash('success') }
        });
    }
};

// Toggle Product Status
exports.toggleProductStatus = async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await Product.findById(productId);

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        product.status = !product.status;
        await product.save();

        res.json({ status: product.status });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred' });
    }
};

// Render Add Product Page
exports.renderAddProduct = async (req, res) => {
    try {
        const categories = await Category.find();
        res.render('admin/addproduct', {
            product: null,
            categories,
            categoryData: categories,
            errors: [],
            messages: { error: req.flash('error'), success: req.flash('success') }
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'An error occurred while loading the add product page');
        res.redirect('/admin/product');
    }
};

// Render Edit Product Page
exports.renderEditProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id).populate('category');
        const categories = await Category.find();

        if (!product) {
            req.flash('error', 'Product not found');
            return res.redirect('/admin/product');
        }

        res.render('admin/editproduct', {
            product,
            categories,
            categoryData: categories,
            errors: [],
            messages: { error: req.flash('error'), success: req.flash('success') }
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'An error occurred while loading the edit product page');
        res.redirect('/admin/product');
    }
};