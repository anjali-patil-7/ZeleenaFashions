const jwt = require('jsonwebtoken')

module.exports = (req,res,next)=>{
    const token = req.cookies.token;
    if(!token) return res.redirect('/admin/login')
        try{
           const decoded = jwt.verify(token,process.env.JWT_SECRET)
           if(decoded.role !== 'admin') return res.redirect('/admin/login')
            req.User = decoded
            next()
        }catch(err){
            res.redirect('/admin/login')
        }
}