const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userSchema');

passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: process.env.NODE_ENV === 'production'
                ? process.env.GOOGLE_CALLBACK_URL
                : 'http://localhost:3000/auth/google/callback',
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                // Check for user by googleId or email
                let user = await User.findOne({
                    $or: [{ googleId: profile.id }, { email: profile.emails[0].value }],
                });

                if (user) {
                    // Link googleId if user exists via email and doesn't have googleId
                    if (!user.googleId) {
                        user.googleId = profile.id;
                        await user.save();
                    }
                    // Check if user is blocked
                    if (user.isBlocked) {
                        return done(null, false, { message: 'Your account is blocked.' });
                    }
                    return done(null, user);
                }

                // Create new user
                user = await User.create({
                    googleId: profile.id,
                    name: profile.displayName,
                    email: profile.emails[0].value,
                    isVerified: true,
                    role: 'user',
                });

                return done(null, user);
            } catch (err) {
                // Enhanced error logging for debugging
                console.error('Google auth error:', {
                    message: err.message,
                    code: err.code,
                    keyPattern: err.keyPattern,
                    keyValue: err.keyValue,
                    stack: err.stack,
                });
                return done(err, null);
            }
        }
    )
);

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        console.error('Deserialize error:', err);
        done(err, null);
    }
});

module.exports = passport;