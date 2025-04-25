const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSchema = new Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    phone: {
        type: String,
        required: false,
        default: null
    },
    googleId: {
        type: String,
        sparse: true
    },
    password: {
        type: String,
        required: false
    },
    isVerified: { 
        type: Boolean,
        default: false
    },
    isBlocked: {
        type: Boolean,
        default: false
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
    createdOn: {
        type: Date,
        default: Date.now
    },
    searchHistory: [{
        category: {
            type: Schema.Types.ObjectId,
            ref: 'Category',
            required: true
        },
        brand: {
            type: String
        },
        searchOn: {
            type: Date,
            default: Date.now
        }
    }]
});

// Ensure sparse index on phone field
userSchema.index({ phone: 1 }, { sparse: true });

const User = mongoose.model("User", userSchema);
module.exports = User;