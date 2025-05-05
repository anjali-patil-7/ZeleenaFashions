const mongoose = require('mongoose');
const {Schema} = mongoose

const paymentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Orders',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        required: true,
        enum: ['pending', 'Paid', 'failed']
    },
    paymentMethod: {
        type: String,
        required: true,
        enum: ['COD', 'online', 'Razorpay', 'Wallet']
    },
    transactionId: {
        type: String
    }

}, { timestamps: true });


const Payment = mongoose.model("Payment",paymentSchema);


module.exports = Payment;