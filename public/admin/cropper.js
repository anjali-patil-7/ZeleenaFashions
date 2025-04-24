// public/js/scripts.js
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('productForm');
    const imageInput = document.getElementById('images');
    const imagePreview = document.getElementById('imagePreview');
    const cropperModal = document.getElementById('cropperModal');
    const cropperImage = document.getElementById('cropperImage');
    const cropButton = document.getElementById('cropButton');
    const cancelButton = document.getElementById('cancelButton');
    const inputs = document.querySelectorAll('.form-control, .form-select');
    let cropper;
    let currentFileIndex;
    let croppedImages = [];
  
    // Form submission handler
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (validateForm()) {
        form.submit();
      }
    });
  
    // Real-time validation
    inputs.forEach((input) => {
      input.addEventListener('input', () => validateField(input));
      input.addEventListener('change', () => validateField(input));
    });
  
    // Image input change handler
    imageInput.addEventListener('change', (e) => {
      const files = e.target.files;
      handleImageValidation(files);
    });
  
    // Crop button handler
    cropButton.addEventListener('click', () => {
      if (cropper) {
        const canvas = cropper.getCroppedCanvas({
          width: 300, // Desired width
          height: 300, // Desired height
        });
  
        canvas.toBlob((blob) => {
          const formData = new FormData();
          formData.append('productImage', blob, `cropped-image-${currentFileIndex + 1}.jpg`);
  
          // Upload cropped image
          fetch('/admin/upload-cropped-image', {
            method: 'POST',
            body: formData,
          })
            .then((response) => response.json())
            .then((data) => {
              if (data.error) {
                showError(imageInput, document.getElementById('imagesError'), data.error);
                return;
              }
              // Store the image path
              croppedImages[currentFileIndex] = data.path;
              document.getElementById(`croppedImage${currentFileIndex}`).value = data.path;
  
              // Update preview
              const previewBox = imagePreview.children[currentFileIndex];
              previewBox.innerHTML = `<img src="${canvas.toDataURL('image/jpeg')}" class="preview-image" alt="Preview ${currentFileIndex + 1}">`;
  
              // Close modal
              cropperModal.style.display = 'none';
              cropper.destroy();
              cropper = null;
  
              // Process next image if any
              if (currentFileIndex + 1 < imageInput.files.length) {
                currentFileIndex++;
                showCropper(imageInput.files[currentFileIndex]);
              }
            })
            .catch((error) => {
              console.error('Upload failed:', error);
              showError(imageInput, document.getElementById('imagesError'), 'Failed to upload cropped image');
            });
        }, 'image/jpeg', 0.8);
      }
    });
  
    // Cancel crop handler
    cancelButton.addEventListener('click', () => {
      cropperModal.style.display = 'none';
      if (cropper) {
        cropper.destroy();
        cropper = null;
      }
      imageInput.value = ''; // Reset input
      resetPreviews();
    });
  
    function validateField(field) {
      const errorElement = document.getElementById(field.id + 'Error');
      errorElement.innerHTML = '';
      field.classList.remove('error');
  
      switch (field.id) {
        case 'name':
          const name = field.value.trim();
          if (!name) {
            showError(field, errorElement, 'Product name is required');
          } else if (name.length < 2 || name.length > 100) {
            showError(field, errorElement, 'Name must be 2-100 characters long');
          } else if (!/^[a-zA-Z\s]+$/.test(name)) {
            showError(field, errorElement, 'Name should only contain letters and spaces');
          }
          break;
  
        case 'description':
          const description = field.value.trim();
          if (!description) {
            showError(field, errorElement, 'Product description is required');
          } else if (description.length < 10 || description.length > 1000) {
            showError(field, errorElement, 'Description must be 10-1000 characters long');
          } else if (!/^[a-zA-Z\s]+$/.test(description)) {
            showError(field, errorElement, 'Description should only contain letters and spaces');
          }
          break;
  
        case 'price':
          const price = parseFloat(field.value);
          if (!field.value || isNaN(price) || price <= 0) {
            showError(field, errorElement, 'Price must be greater than 0');
          } else if (price > 1000000) {
            showError(field, errorElement, 'Price cannot exceed 1,000,000');
          }
          break;
  
        case 'stock':
          const stock = parseInt(field.value);
          if (!field.value || isNaN(stock) || stock < 0) {
            showError(field, errorElement, 'Stock must be 0 or greater');
          } else if (stock > 10000) {
            showError(field, errorElement, 'Stock cannot exceed 10,000');
          }
          break;
  
        case 'category':
          if (!field.value) {
            showError(field, errorElement, 'Please select a category');
          }
          break;
      }
    }
  
    function validateForm() {
      let isValid = true;
      const fields = ['name', 'description', 'price', 'stock', 'category'];
      fields.forEach((fieldId) => {
        const field = document.getElementById(fieldId);
        validateField(field);
        if (field.classList.contains('error')) {
          isValid = false;
        }
      });
  
      // Validate images
      const imagesError = document.getElementById('imagesError');
      imagesError.innerHTML = '';
      imageInput.classList.remove('error');
      if (croppedImages.length !== 3) {
        showError(imageInput, imagesError, 'Exactly 3 cropped images are required');
        isValid = false;
      }
  
      return isValid;
    }
  
    function showError(field, errorElement, message) {
      errorElement.innerHTML = message;
      field.classList.add('error');
    }
  
    function handleImageValidation(files) {
      const imagesError = document.getElementById('imagesError');
      imagesError.innerHTML = '';
      imageInput.classList.remove('error');
  
      if (files.length !== 3) {
        showError(imageInput, imagesError, 'Exactly 3 images are required');
        return;
      }
  
      const validExtensions = ['.jpg', '.jpeg', '.png'];
      const maxSize = 5 * 1024 * 1024; // 5MB
  
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileName = file.name.toLowerCase();
  
        if (!validExtensions.some((ext) => fileName.endsWith(ext))) {
          showError(imageInput, imagesError, 'Only JPG, JPEG, or PNG files are allowed');
          return;
        }
  
        if (file.size > maxSize) {
          showError(imageInput, imagesError, 'Each image must be less than 5MB');
          return;
        }
      }
  
      // Reset previews and cropped images
      resetPreviews();
      croppedImages = [];
      currentFileIndex = 0;
      showCropper(files[0]);
    }
  
    function showCropper(file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        cropperImage.src = e.target.result;
        cropperModal.style.display = 'flex';
        if (cropper) cropper.destroy();
        cropper = new Cropper(cropperImage, {
          aspectRatio: 1, // Square images
          viewMode: 1,
          autoCropArea: 0.8,
        });
      };
      reader.readAsDataURL(file);
    }
  
    function resetPreviews() {
      const previewBoxes = document.querySelectorAll('.preview-box');
      previewBoxes.forEach((box, index) => {
        box.innerHTML = `<div class="preview-placeholder"><span>Image ${index + 1}</span></div>`;
      });
      document.querySelectorAll('input[name="croppedImages"]').forEach((input) => {
        input.value = '';
      });
    }
  });