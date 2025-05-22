
const mongoose = require('mongoose');
const { Schema } = mongoose;

const orderSchema = new Schema({
    userId: {
        type: mongoose.Schema.ObjectId,
        ref: "User",
    },
    cartId: {
        type: mongoose.Schema.ObjectId,
        ref: "Cart"
    },
    deliveryAddress: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Address",
        required: true
    },
    orderNumber: {
        type: String,
        required: true,
        unique: true
    },
    orderedItem: [{
        productId: {
            type: mongoose.Schema.ObjectId,
            ref: "Product",
        },
        quantity: {
            type: Number,
            required: true,
        },
        productPrice: {
            type: Number,
            required: true,
        },
        finalProductPrice: { 
            type: Number,
            required: true
        },
        totalProductPrice: { 
            type: Number,
            required: true
        },
        finalTotalProductPrice: { 
            type: Number,
            required: true
        },
        productStatus: {
            type: String,
            enum: ["Pending", "Shipped", "Delivered", "Cancelled", "Returned", "Return Requested", "Return Approved", "Return Rejected"],
            default: "Pending",
            required: true
        },
        refunded: {
            type: Boolean,
            default: false
        },
        returnReason: {
            type: String,
        },
        returnRequestDate: Date,
        returnApproved: {
            type: Boolean,
            default: false
        },
        returnApprovedDate: Date,
        returnNotes: String
    }],
    orderAmount: { // Total before discount
        type: Number,
        required: true
    },
    discountAmount: { // Coupon or offer discount
        type: Number,
        default: 0
    },
    couponDiscount: { // Coupon discount amount
        type: Number,
        default: 0
    },
    couponCode: { // Coupon code applied
        type: String,
        default: null
    },
    finalAmount: { // Total after discount
        type: Number,
        required: true
    },
    couponApplied: { 
        type: mongoose.Schema.Types.ObjectId,
        ref: "Coupon",
    },
    appliedOffer: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "Offer",
    },
    deliveryDate: {
        type: Date
    },
    shippingDate: {
        type: Date
    },
    paymentMethod: {
        type: String,
        required: true
    },
    paymentStatus: {
        type: String,
        enum: ["Pending", "Paid", "Failed", "refunded", "Partially Refunded"],
        default: "Pending",
        required: true
    },
    paymentId: { 
        type: String,
        default: null
    },
    orderStatus: {
        type: String,
        enum: ["Pending","Confirmed", "Shipped", "Out for Delivery", "Delivered", "Cancelled", "Returned"],
        default: "Pending"
    },
    razorpayOrderId: {
        type: String,
        default: null
    }
}, { timestamps: true });

const Orders = mongoose.model("Orders", orderSchema);

module.exports = Orders;
