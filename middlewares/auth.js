const verifySession = (req, res, next) => {
    // Check if user session exists and is valid, and not an admin
    if (!req.session || !req.session.user || !req.session.user.id || !req.session.user.isAuth || req.session.admin) {
        req.flash('error_msg', 'Please log in as a user to access this page.');
        return res.redirect('/login');
    }
    next();
};

const ifLogged = (req, res, next) => {
    // Check if user is already logged in
    if (req.session.user && req.session.user.id && req.session.user.isAuth) {
        return res.redirect('/');
    }
    next();
};

const logged = (req, res, next) => {
    console.log('logged: req.session:', req.session);
    // Check if user session exists and is authenticated
    if (!req.session.user || !req.session.user.id || !req.session.user.isAuth) {
        req.flash('error_msg', 'Please log in to access this page.');
        return res.redirect('/login');
    }
    next();
};

module.exports = { verifySession, ifLogged, logged };