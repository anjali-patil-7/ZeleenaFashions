const mongoose = require("mongoose");
const {Schema} = mongoose;

const cartSchema = new Schema({
    user : {
        type : mongoose.Schema.ObjectId,
        ref : "User",
    },
    cartItem : [{
        productId : {
        type : mongoose.Schema.ObjectId,
        ref : "Product",
        } ,
        quantity : {
            type : Number,
            required : true
        },
        price : {
            type : Number,
            required : true
        },
        stock : {
            type : Number,
            required : true
        },
        total : {
            type : Number,
            required : true
        }
    }],
    cartTotal : {
        type : Number,
        required : true
    }
},{timestamps : true})





const Cart =  mongoose.model("Cart",cartSchema);

module.exports = Cart;