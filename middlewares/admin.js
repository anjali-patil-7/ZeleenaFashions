
module.exports = (req,res,next)=>{
      console.log('verifySession: admin req.session:', req.session.admin);

    if(!req.session || !req.session.admin){
        req.flash('error_msg','please log in to access this page ')
        return res.redirect('/admin/login')
    }
    next()
}