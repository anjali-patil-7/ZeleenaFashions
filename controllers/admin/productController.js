const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema'); // Fixed import
const path = require("path");
const fs = require("fs");
const { uploadImage } = require('../../config/cloudinary');

// Render Add Product Page
exports.renderAddProduct = async (req, res) => {
  try {
    const categories = await Category.find({ isDeleted: false });
    res.render("admin/addproduct", {
      formData: req.session.formData || {},
      categories,
      errors: req.session.errors || [],
      messages: { error: req.flash("error"), success: req.flash("success") },
    });
    req.session.formData = null;
    req.session.errors = null;
  } catch (error) {
    console.error("Error rendering add product page:", error);
    req.flash("error", "An error occurred while loading the add product page");
    res.redirect("/admin");
  }
};

// Add Product
exports.addProduct = async (req, res) => {
  try {
    const { name, description, price, stock, category, status } = req.body;
    const files = req.files || [];

    const errors = [];
    // Validation
    if (!name || name.trim().length < 2 || name.trim().length > 100) {
      errors.push("Product name must be 2-100 characters long");
    } else if (!/^[a-zA-Z\s]+$/.test(name.trim())) {
      errors.push("Product name should only contain letters and spaces");
    }

    if (!description || !description.trim()) {
      errors.push("Description is required");
    } else {
      const trimmedDescription = description.trim();
      if (trimmedDescription.length < 10 || trimmedDescription.length > 1000) {
        errors.push("Description must be 10-1000 characters long");
      } else if (!/^[a-zA-Z0-9][a-zA-Z0-9\s.,\-:;'"()!?]*$/.test(trimmedDescription)) {
        errors.push(
          "Description can only contain letters, numbers, spaces, and punctuation (, . - : ; ' \" ( ) ! ?), and should not start with a special character or space"
        );
      }
    }

    const priceNum = parseInt(price);
    if (!price || isNaN(priceNum) || priceNum < 1 || priceNum > 1000000) {
      errors.push("Price must be between 1 and 1,000,000");
    }

    const stockNum = parseInt(stock);
    if (!stock || isNaN(stockNum) || stockNum < 0 || stockNum > 10000) {
      errors.push("Stock must be between 0 and 10,000");
    }

    if (!category) {
      errors.push("Category is required");
    }

    if (files.length !== 3) {
      errors.push(`Exactly 3 images are required, received ${files.length}`);
    } else {
      const validExtensions = ["image/jpeg", "image/jpg", "image/png"];
      const maxSize = 5 * 1024 * 1024; // 5MB
      files.forEach((file, index) => {
        if (!validExtensions.includes(file.mimetype)) {
          errors.push(`Image ${index + 1} must be JPG, JPEG, or PNG`);
        }
        if (file.size > maxSize) {
          errors.push(`Image ${index + 1} must be less than 5MB`);
        }
      });
    }

    if (!["true", "false"].includes(status)) {
      errors.push("Status must be either Active or Inactive");
    }

    if (errors.length > 0) {
      const categories = await Category.find({ isDeleted: false });
      req.session.formData = {
        name: name || "",
        description: description || "",
        price: price || "",
        stock: stock || "",
        category: category || "",
        status: status || true,
      };
      req.session.errors = errors;
      return res.render("admin/addproduct", {
        formData: req.session.formData,
        categories,
        errors,
        messages: { error: errors.join(", "), success: "" },
      });
    }

    const imageUrls = await uploadImage(files);

    const product = new Product({
      productName: name.trim(),
      description: description.trim(),
      price: priceNum,
      totalStock: stockNum,
      category,
      productImage: imageUrls,
      status: status === "true",
    });

    await product.save();
    req.session.formData = null; // Clear formData
    req.session.errors = null;
    req.flash("success", "Product added successfully");
    res.redirect("/admin/product");
  } catch (error) {
    console.error("Error adding product:", error);
    const categories = await Category.find({ isDeleted: false });
    req.session.formData = {
      name: req.body.name || "",
      description: req.body.description || "",
      price: req.body.price || "",
      stock: req.body.stock || "",
      category: req.body.category || "",
      status: req.body.status || true,
    };
    req.session.errors = [error.message || "An error occurred while adding the product"];
    return res.render("admin/addproduct", {
      formData: req.session.formData,
      categories,
      errors: req.session.errors,
      messages: { error: req.session.errors.join(", "), success: "" },
    });
  }
};

// Render Edit Product Page
exports.renderEditProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate("category");
    const categories = await Category.find({ isDeleted: false });

    if (!product) {
      req.flash("error", "Product not found");
      return res.redirect("/admin/product");
    }

    res.render("admin/editproduct", {
      product,
      categories,
      formData: req.session.formData || {},
      errors: req.session.errors || [],
      messages: { error: req.flash("error"), success: req.flash("success") },
    });
    req.session.formData = null;
    req.session.errors = null;
  } catch (error) {
    console.error("Error rendering edit product page:", error);
    req.flash("error", "An error occurred while loading the edit product page");
    res.redirect("/admin/product");
  }
};

// Edit Product
exports.editProduct = async (req, res) => {
  try {
    const {
      id,
      name,
      description,
      price,
      stock,
      category,
      status,
      removedImages,
      replacedImages,
    } = req.body;
    const files = req.files || [];

    // Backend validation
    const errors = [];
    if (!name || name.trim().length < 2 || name.trim().length > 100) {
      errors.push("Product name must be 2-100 characters long");
    } else if (!/^[a-zA-Z\s]+$/.test(name.trim())) {
      errors.push("Product name should only contain letters and spaces");
    }

    if (!description || !description.trim()) {
      errors.push("Description is required");
    } else {
      const trimmedDescription = description.trim();
      if (trimmedDescription.length < 10 || trimmedDescription.length > 1000) {
        errors.push("Description must be 10–1000 characters long");
      } else if (!/^[a-zA-Z0-9\s,.]+$/.test(trimmedDescription)) {
        errors.push(
          "Description can only contain letters, numbers, spaces, periods, and commas"
        );
      }
    }

    const priceNum = parseInt(price);
    if (!price || isNaN(priceNum) || priceNum < 1 || priceNum > 1000000) {
      errors.push("Price must be between 1 and 1,000,000");
    }

    const stockNum = parseInt(stock);
    if (!stock || isNaN(stockNum) || stockNum < 0 || stockNum > 10000) {
      errors.push("Stock must be between 0 and 10,000");
    }

    if (!category) {
      errors.push("Category is required");
    }

    // Fetch existing product
    const product = await Product.findById(id);
    if (!product) {
      req.flash("error", "Product not found");
      return res.redirect("/admin/product");
    }

    // Parse removedImages and replacedImages
    let removedIndexes = [];
    let replacedIndexes = [];
    try {
      removedIndexes = removedImages && removedImages !== '[]' ? JSON.parse(removedImages).map(Number) : [];
      replacedIndexes = replacedImages && replacedImages !== '[]' ? JSON.parse(replacedImages).map(Number) : [];
    } catch (e) {
      errors.push("Invalid image data format");
    }

    // Validate indexes
    removedIndexes = removedIndexes.filter(idx => idx >= 0 && idx < product.productImage.length);
    replacedIndexes = replacedIndexes.filter(idx => idx >= 0 && idx < product.productImage.length);

    // Initialize current images array
    let currentImages = [...product.productImage];

    // Handle removed images
    if (removedIndexes.length > 0) {
      removedIndexes.sort((a, b) => b - a); // Sort descending to avoid index shifting
      for (let index of removedIndexes) {
        currentImages.splice(index, 1);
      }
    }

    // Handle replaced images
    for (let index of replacedIndexes) {
      const replacementFile = files.find(f => f.fieldname === `replace_${index}`);
      if (replacementFile) {
        const imageUrls = await uploadImage([replacementFile]);
        if (index >= 0 && index < currentImages.length) {
          currentImages[index] = imageUrls[0];
        } else {
          errors.push(`Invalid replacement index ${index}`);
        }
      } else {
        errors.push(`No replacement file found for index ${index}`);
      }
    }

    // Handle new images
    const newFiles = files.filter(f => f.fieldname === 'images');
    if (newFiles.length > 0) {
      const remainingSlots = 3 - currentImages.length;
      if (newFiles.length > remainingSlots) {
        errors.push(`Cannot add ${newFiles.length} new images. Only ${remainingSlots} slots available.`);
      } else {
        const newImageUrls = await uploadImage(newFiles);
        currentImages = [...currentImages, ...newImageUrls];
      }
    }

    // Validate total images
    if (currentImages.length !== 3) {
      errors.push(`Exactly 3 images are required, received ${currentImages.length} after processing`);
    }

    // Validate image files
    const validExtensions = ["image/jpeg", "image/jpg", "image/png"];
    const maxSize = 5 * 1024 * 1024;
    files.forEach(file => {
      if (!validExtensions.includes(file.mimetype)) {
        errors.push(`Image ${file.originalname} must be JPG, JPEG, or PNG`);
      }
      if (file.size > maxSize) {
        errors.push(`Image ${file.originalname} must be less than 5MB`);
      }
    });

    if (errors.length > 0) {
      const categories = await Category.find({ isDeleted: false });
      req.session.formData = {
        name: name || "",
        description: description || "",
        price: price || "",
        stock: stock || "",
        category: category || "",
         status: status || true,
      };
      req.session.errors = errors;
      return res.render("admin/editproduct", {
        product,
        categories,
        formData: req.session.formData,
        errors,
        messages: { error: errors.join(", "), success: "" },
      });
    }

    // Update product
    await Product.findByIdAndUpdate(
      id,
      {
        productName: name.trim(),
        description: description.trim(),
        price: priceNum,
        totalStock: stockNum,
        category,
        productImage: currentImages,
        status: status === "true",
      },
      { new: true }
    );

    req.session.formData = null; // Clear formData
    req.session.errors = null;
    req.flash("success", "Product updated successfully");
    res.redirect("/admin/product");
  } catch (error) {
    console.error("Error updating product:", error);
    const product = await Product.findById(req.body.id).populate("category").catch(() => null);
    const categories = await Category.find({ isDeleted: false });
    req.session.formData = {
      name: req.body.name || "",
      description: req.body.description || "",
      price: req.body.price || "",
      stock: req.body.stock || "",
      category: req.body.category || "",
      status: req.body.status || "true",
    };
    req.session.errors = [error.message || "An error occurred while updating the product"];
    return res.render("admin/editproduct", {
      product,
      categories,
      formData: req.session.formData,
      errors: req.session.errors,
      messages: { error: req.session.errors.join(", "), success: "" },
    });
  }
};

// Get Products
exports.getProducts = async (req, res) => {
  try {
    let page = parseInt(req.query.page) || 1;
    const limit = 5;
    const searchQuery = req.query.query ? req.query.query.trim() : "";
    const sortBy = req.query.sort || "updatedAt";
    const sortOrder = req.query.order === "asc" ? 1 : -1;

    if (page < 1 || isNaN(page)) {
      page = 1;
    }

    console.log(`Page: ${page}, Search Query: ${searchQuery}, Sort By: ${sortBy}, Sort Order: ${sortOrder}`);

    const query = searchQuery
      ? {
          $or: [
            { productName: { $regex: searchQuery, $options: "i" } },
            { description: { $regex: searchQuery, $options: "i" } },
          ],
          isDeleted: false,
        }
      : { isDeleted: false };

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder;

    const products = await Product.find(query)
      .populate("category")
      .sort(sortOptions)
      .skip((page - 1) * limit)
      .limit(limit);

    const totalProducts = await Product.countDocuments(query);
    let totalPages = Math.ceil(totalProducts / limit) || 1;

    if (page > totalPages) {
      return res.redirect(
        `/admin/product?page=${totalPages}${searchQuery ? '&query=' + encodeURIComponent(searchQuery) : ''}&sort=${sortBy}&order=${req.query.order || 'desc'}`
      );
    }

    console.log(`Total Products: ${totalProducts}, Total Pages: ${totalPages}, Products Fetched: ${products.length}`);

    res.render("admin/product", {
      products,
      currentPage: page,
      totalPages,
      searchQuery,
      sortBy,
      sortOrder: req.query.order || "desc",
      messages: { error: req.flash("error"), success: req.flash("success") },
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    req.flash("error", "An error occurred while fetching products");
    res.render("admin/product", {
      products: [],
      currentPage: 1,
      totalPages: 1,
      searchQuery: "",
      sortBy: "updatedAt",
      sortOrder: "desc",
      messages: { error: req.flash("error"), success: req.flash("success") },
    });
  }
};

// Toggle Product Status
exports.toggleProductStatus = async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    product.status = !product.status;
    await product.save();

    res.json({ status: product.status });
  } catch (error) {
    console.error("Error toggling product status:", error);
    res.status(500).json({ message: "An error occurred" });
  }
};

// Delete Product
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, isDeleted: false });
    if (!product) {
      return res.status(404).json({ error: "Product not found or already deleted" });
    }
    product.isDeleted = true;
    await product.save();
    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({ error: "An error occurred while deleting the product" });
  }
};