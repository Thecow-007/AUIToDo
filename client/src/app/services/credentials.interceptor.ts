import { HttpInterceptorFn } from '@angular/common/http';

// Session cookie must ride on every request — backend uses passport+connect-mongo
// (server/app.js) so withCredentials is mandatory.
export const credentialsInterceptor: HttpInterceptorFn = (req, next) =>
  next(req.clone({ withCredentials: true }));
