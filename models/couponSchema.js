const mongoose = require('mongoose');
const { Schema } = mongoose;

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  discountType: {
    type: String,
    enum: ['percentage', 'flat'],
    required: true
  },
  minimumPrice: {
    type: Number,
    required: true,
    min: 0
  },
  discount: {
    type: Number,
    required: true,
    min: 0
  },
  maxDiscount: {
    type: Number,
    min: 0,
    default: null
  },
  maxRedeem: {
    type: Number,
    required: true,
    min: 1
  },
  expiry: {
    type: Date,
    required: true
  },
  status: {
    type: Boolean,
    required: true,
    default: true
  },
  description: {
    type: String,
    default: ''
  },
  usedBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    usedAt: {
      type: Date,
      default: Date.now
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order'
    }
  }]
}, { timestamps: true });

// TTL index to remove expired coupons
couponSchema.index({ expiry: 1 }, { expireAfterSeconds: 0 });

const Coupon = mongoose.model('Coupon', couponSchema);

module.exports = Coupon;