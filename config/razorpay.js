const Razorpay = require('razorpay');
require('dotenv').config()

exports.createRazorpayInstance = ()=>{
    try{
        if(!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET){
             throw new Error('Razorpay keys are not defined in environment variables')
        }

        const instance = new Razorpay({
            key_id:process.env.RAZORPAY_KEY_ID,
            key_secret:process.env.RAZORPAY_KEY_SECRET
        });
        return instance
    } catch(error){
        console.error('Error creating Razorpay instance:',error.message,error.stack)
        throw error;
    }
}