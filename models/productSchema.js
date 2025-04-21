const mongoose = require("mongoose");
const {Schema} = mongoose;


const productSchema = new Schema({
    productName : {type : String,required : true},
    description : {type : String, required : true},
    category : {type : Schema.Types.ObjectId, ref : "Category",required : true},
    price : {type : Number,required : true},
    totalStock : {type : Number,required : true}, 
    productImage : {type : [String],required : true},
    status : {type : Boolean,default : true},
    
},{timestamps : true});



const Product = mongoose.model("Product",productSchema);


module.exports = Product;