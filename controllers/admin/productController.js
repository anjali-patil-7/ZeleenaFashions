const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const path = require("path");
const fs = require("fs");

// Add Product
exports.addProduct = async (req, res) => {
  try {
    console.log("POST /admin/product/addproduct received");
    console.log("Request Body:", req.body);
    console.log("Uploaded Files:", req.files);

    const { name, description, price, stock, category, status } = req.body;
    const files = req.files || [];

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

    if (
      !price ||
      isNaN(price) ||
      parseFloat(price) <= 0 ||
      parseFloat(price) > 1000000
    ) {
      errors.push("Price must be between 0.01 and 1,000,000");
    }

    if (
      !stock ||
      isNaN(stock) ||
      parseInt(stock) < 0 ||
      parseInt(stock) > 10000
    ) {
      errors.push("Stock must be between 0 and 10,000");
    }

    if (!category) {
      errors.push("Category is required");
    }
    console.log("files>>>>", files);

    if (files.length !== 3) {
      errors.push(`Exactly 3 images are required, received ${files.length}`);
    } else {
      const validExtensions = ["image/jpeg", "image/jpg", "image/png"];
      console.log("validExtensions:",validExtensions)
      const maxSize = 5 * 1024 * 1024;
      files.forEach((file, index) => {
        if (!validExtensions.includes(file.mimetype)) {
          errors.push(`Image ${index + 1} must be JPG, JPEG, or PNG`);
        }
        if (file.size > maxSize) {
          errors.push(`Image ${index + 1} must be less than 5MB`);
        }
      });
    }

    if (errors.length > 0) {
      console.log("Validation errors:", errors);
      const categories = await Category.find();
      return res.render("admin/addproduct", {
        product: { name, description, price, stock, category, status },
        categories,
        errors,
        messages: { error: errors.join(", "), success: "" },
      });
    }

    const imagePaths = files.map(
      (file) => `/uploads/products/${file.filename}`
    );
    console.log("Image paths:", imagePaths);

    const product = new Product({
      productName: name.trim(),
      description: description.trim(),
      price: parseFloat(price),
      totalStock: parseInt(stock),
      category,
      productImage: imagePaths,
      status: status === "true",
    });

    await product.save();
    console.log("Product saved:", product);
    req.flash("success", "Product added successfully");
    res.redirect("/admin/product");
  } catch (error) {
    console.error("Error adding product:", error);
    const categories = await Category.find();
    const errorMessage =
      error.message || "An error occurred while adding the product";
    return res.render("admin/addproduct", {
      product: req.body,
      categories,
      errors: [errorMessage],
      messages: { error: errorMessage, success: "" },
    });
  }
};

// Edit Product
exports.editProduct = async (req, res) => {
  try {
    console.log("POST /admin/editproduct/:id received");
    console.log("Request Body:", req.body);
    console.log("Uploaded Files:", req.files);

    const {
      id,
      name,
      description,
      price,
      stock,
      category,
      status,
      removedImages,
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

    if (
      !price ||
      isNaN(price) ||
      parseFloat(price) <= 0 ||
      parseFloat(price) > 1000000
    ) {
      errors.push("Price must be between 0.01 and 1,000,000");
    }

    if (
      !stock ||
      isNaN(stock) ||
      parseInt(stock) < 0 ||
      parseInt(stock) > 10000
    ) {
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

    // Parse removedImages
    let removedIndexes = [];
    if (removedImages) {
      try {
        removedIndexes = JSON.parse(removedImages).map(Number);
      } catch (e) {
        errors.push("Invalid removed images data");
      }
    }

    // Validate images
    let currentImages = [...product.productImage];
    if (removedIndexes.length > 0) {
      removedIndexes.sort((a, b) => b - a); // Sort descending to avoid index issues
      for (let index of removedIndexes) {
        if (index >= 0 && index < currentImages.length) {
          const imagePath = path.join(
            __dirname,
            "../../public",
            currentImages[index]
          );
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath); // Delete file
          }
          currentImages.splice(index, 1); // Remove from array
        }
      }
    }

    // Add new images
    let newImagePaths = files.map(
      (file) => `/uploads/products/${file.filename}`
    );
    currentImages = [...currentImages, ...newImagePaths];

    // Validate total images
    if (currentImages.length !== 3) {
      errors.push(
        `Exactly 3 images are required, received ${currentImages.length} after processing`
      );
    } else if (newImagePaths.length > 0) {
      const validExtensions = ["image/jpeg", "image/jpg", "image/png"];
      const maxSize = 5 * 1024 * 1024;
      files.forEach((file, index) => {
        if (!validExtensions.includes(file.mimetype)) {
          errors.push(`New image ${index + 1} must be JPG, JPEG, or PNG`);
        }
        if (file.size > maxSize) {
          errors.push(`New image ${index + 1} must be less than 5MB`);
        }
      });
    }

    if (errors.length > 0) {
      const categories = await Category.find();
      return res.render("admin/editproduct", {
        product,
        categories,
        errors,
        messages: { error: errors.join(", "), success: "" },
      });
    }

    // Update product
    await Product.findByIdAndUpdate(id, {
      productName: name.trim(),
      description: description.trim(),
      price: parseFloat(price),
      totalStock: parseInt(stock),
      category,
      productImage: currentImages,
      status: status === "true",
    });

    req.flash("success", "Product updated successfully");
    res.redirect("/admin/product");
  } catch (error) {
    console.error("Error updating product:", error);
    const product = await Product.findById(req.body.id)
      .populate("category")
      .catch(() => null);
    const categories = await Category.find();
    return res.render("admin/editproduct", {
      product,
      categories,
      errors: [error.message || "An error occurred while updating the product"],
      messages: { error: error.message, success: "" },
    });
  }
};

// Get Products
exports.getProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const searchQuery = req.query.query || "";

    const query = searchQuery
      ? {
          $or: [
            { productName: { $regex: searchQuery, $options: "i" } },
            { description: { $regex: searchQuery, $options: "i" } },
          ],
        }
      : {};

    const products = await Product.find(query)
      .populate("category")
      .skip((page - 1) * limit)
      .limit(limit);

    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limit);

    res.render("admin/product", {
      products,
      currentPage: page,
      totalPages,
      searchQuery,
      messages: { error: req.flash("error"), success: req.flash("success") },
    });
  } catch (error) {
    console.error(error);
    req.flash("error", "An error occurred while fetching products");
    res.render("admin/product", {
      products: [],
      currentPage: 1,
      totalPages: 1,
      searchQuery: "",
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
    console.error(error);
    res.status(500).json({ message: "An error occurred" });
  }
};

// Render Add Product Page
exports.renderAddProduct = async (req, res) => {
  try {
    const categories = await Category.find();
    res.render("admin/addproduct", {
      product: null,
      categories,
      errors: [],
      messages: { error: req.flash("error"), success: req.flash("success") },
    });
  } catch (error) {
    console.error(error);
    req.flash("error", "An error occurred while loading the add product page");
    res.redirect("/admin/product");
  }
};

// Render Edit Product Page
exports.renderEditProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate("category");
    const categories = await Category.find();

    if (!product) {
      req.flash("error", "Product not found");
      return res.redirect("/admin/product");
    }

    res.render("admin/editproduct", {
      product,
      categories,
      errors: [],
      messages: { error: req.flash("error"), success: req.flash("success") },
    });
  } catch (error) {
    console.error(error);
    req.flash("error", "An error occurred while loading the edit product page");
    res.redirect("/admin/product");
  }
};
