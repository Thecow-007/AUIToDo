// Centralized error handler. Controllers throw HttpError (or any Error) and this
// converts to a JSON response. Unknown errors become 500s and are logged server-side.

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function errorHandler(err, req, res, _next) {
  if (res.headersSent) return;
  const status = err.status || 500;
  if (status >= 500) {
    console.error('[error]', err);
  }
  res.status(status).json({
    error: err.message || 'internal_error',
    ...(err.details ? { details: err.details } : {}),
  });
}

module.exports = { HttpError, errorHandler };
