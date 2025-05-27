const mongoose = require("mongoose");
const { Schema } = mongoose;

const categorySchema = new Schema(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    status: { type: Boolean, default: true, required: true },
    image: {type : String, required: true},
    isDeleted:{type:Boolean,default:false}
  },
  { timestamps: true }
);

const Category = mongoose.model("Category", categorySchema);
module.exports = Category;
