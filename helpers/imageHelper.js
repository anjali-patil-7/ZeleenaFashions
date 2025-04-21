const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// Process and crop image
exports.processImage = async (file, uploadDir) => {
    try {
        const imageName = `${Date.now()}-${file.originalname}`;
        const outputPath = path.join(uploadDir, imageName);

        // Ensure the upload directory exists
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        await sharp(file.path)
            .resize(300, 300, {
                fit: 'cover',
                position: 'center'
            })
            .toFile(outputPath);

        // Delete the original uploaded file
        fs.unlinkSync(file.path);
        return imageName;
    } catch (error) {
        console.error('Error processing image:', error);
        throw new Error('Image processing failed');
    }
};

// Delete image
exports.deleteImage = async (imageName, uploadDir) => {
    try {
        const imagePath = path.join(uploadDir, imageName);
        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
        }
    } catch (error) {
        console.error('Error deleting image:', error);
    }
};