
module.exports = (req, res, next) => {

    if (!req.session || !req.session.admin || !req.session.admin.id) {
        req.flash('error_msg', 'Please log in to access this page');
        return res.redirect('/admin/login');
    }
    next();
};