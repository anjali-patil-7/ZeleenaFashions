const verifySession = (req, res, next) => {
  if (!req.session.userId || !req.session.isAuth) {
    req.flash("error_msg", "Please log in to access this page.");
    return res.redirect("/login");
  }
  next();
};

const ifLogged = (req, res, next) => {
  if (req.session.userId && req.session.isAuth) {
    return res.redirect("/");
  }
  next();
};

const logged = (req, res, next) => {
  if (!req.session.userId || !req.session.isAuth) {
    req.flash("error_msg", "Please log in to access this page.");
    return res.redirect("/login");
  }
  next();
};

module.exports = { verifySession, ifLogged, logged };