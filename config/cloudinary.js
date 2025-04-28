const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: "drmlddnl3",
  api_key: "129316611314383",
  api_secret: "GqumFIFZTOHbM9ykKtt09x69z5Q",
});

async function uploadImage(imageFiles) {
    console.log("imageFiles:", imageFiles);
  
    const allImages = [];
  
    for (const file of imageFiles) {
      const res = await cloudinary.uploader.upload(file.path); // upload from path instead of buffer
      allImages.push(res.secure_url); // secure_url is preferred
    }
  
    return allImages; // returns array of image URLs
  }
  

module.exports = { uploadImage };
