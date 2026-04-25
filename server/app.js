// Express app — middleware, routes, error handler. Importable by tests without
// touching the network. `server.js` is the runtime entry point that connects to
// Mongo and binds a port.

const path = require('path');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');

const env = require('./config/env');
const passport = require('./config/passport');
const { errorHandler } = require('./middleware/errorHandler');
const requireAuth = require('./middleware/requireAuth');

const authRoutes = require('./routes/auth');
const todoRoutes = require('./routes/todos');
const tagRoutes = require('./routes/tags');
const aiChatRoutes = require('./routes/aiChat');

const app = express();

app.use(express.json({ limit: '1mb' }));

app.use(session({
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  // connect-mongo needs an active mongoose connection or a Mongo URI; use the URI if set
  // and fall back to an in-memory store otherwise so dev without Mongo still boots.
  store: env.MONGODB_URI
    ? MongoStore.create({ mongoUrl: env.MONGODB_URI, dbName: env.DB_NAME, collectionName: 'sessions' })
    : undefined,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
  },
}));
app.use(passport.initialize());
app.use(passport.session());

app.use('/api/auth', authRoutes);
app.use('/api/todos', requireAuth, todoRoutes);
app.use('/api/tags', requireAuth, tagRoutes);
app.use('/api/ai', requireAuth, aiChatRoutes);

// Static client (production build). In dev the Angular CLI serves the client itself.
app.use(express.static(path.join(__dirname, '..', 'public')));

// SPA fallback: serve index.html for unmatched GETs so deep-linked routes (e.g. /calendar)
// don't 404 on hard refresh. Skip /api/* so unknown API paths still return JSON 404s.
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'), (err) => {
    if (err) next();
  });
});

app.use(errorHandler);

module.exports = app;
