// Wraps async route handlers so thrown errors propagate to Express's error
// middleware instead of becoming unhandled rejections.
module.exports = function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
};
