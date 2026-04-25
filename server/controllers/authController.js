const bcrypt = require('bcrypt');
const passport = require('passport');

const User = require('../models/User');
const { HttpError } = require('../middleware/errorHandler');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.register = async (req, res, next) => {
  const { email, password, displayName } = req.body || {};
  if (!email || !EMAIL_RE.test(email)) throw new HttpError(400, 'invalid_email');
  if (!password || password.length < 8) throw new HttpError(400, 'password_too_short');
  if (!displayName || !displayName.trim()) throw new HttpError(400, 'display_name_required');

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) throw new HttpError(409, 'email_taken');

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    email: normalizedEmail,
    passwordHash,
    displayName: displayName.trim(),
  });

  // Auto-login on register so the client doesn't need a second round-trip.
  req.login(user, (err) => {
    if (err) return next(err);
    res.status(201).json(user.toClientJSON());
  });
};

exports.login = (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.status(401).json({ error: info?.message || 'invalid_credentials' });
    req.login(user, (loginErr) => {
      if (loginErr) return next(loginErr);
      res.json(user.toClientJSON());
    });
  })(req, res, next);
};

exports.logout = (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy((destroyErr) => {
      if (destroyErr) return next(destroyErr);
      res.clearCookie('connect.sid');
      res.status(204).end();
    });
  });
};

exports.me = (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
  res.json(req.user.toClientJSON());
};
