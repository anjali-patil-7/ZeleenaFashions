const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  userId:{type: mongoose.Schema.Types.ObjectId, ref:'User', required:true},
  name:{type: String, required:true,trim:true},
  mobile:{type:String, required:true, trim:true},
  email:{type:String,required:true,trim:true},
  pincode:{type:String,required:true,trim:true},
  houseName:{type:String,required:true,trim:true},
  street: { type: String,required: true,trim: true},
  city: {type: String,required: true,trim: true},
 state: {type: String,required: true,trim: true},
 country: {type: String,required: true,trim: true},
 saveAs: {type: String,required: true,enum: ['Home', 'Work', 'Other']},
 isDefault: {type: Boolean,default: false}}, {
  timestamps: true});

module.exports = mongoose.model('Address', addressSchema);
