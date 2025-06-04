const verifySession = (req, res, next) => {
  console.log('verifySession: req.session:', req.session);
  if (!req.session.userId || !req.session.isAuth) {
    req.flash('error_msg', 'Please log in to access this page.');
    return res.redirect('/login');
  }
  next();
};

const ifLogged = (req, res, next) => {
  if (req.session.userId && req.session.isAuth) {
    return res.redirect('/');
  }
  next();
};

const logged = (req, res, next) => {
  console.log('logged: req.session:', req.session);
  if (!req.session.userId || !req.session.isAuth) {
    req.flash('error_msg', 'Please log in to access this page.');
    return res.redirect('/login');
  }
  next();
};

module.exports = { verifySession, ifLogged, logged };