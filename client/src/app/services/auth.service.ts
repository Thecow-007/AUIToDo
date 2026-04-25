import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, tap } from 'rxjs';

export interface AuthUser {
  id: string;
  email: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  readonly currentUser = signal<AuthUser | null>(null);

  refreshMe(): Observable<AuthUser | null> {
    return this.http.get<AuthUser>('/api/auth/me').pipe(
      tap((user) => this.currentUser.set(user)),
      catchError(() => {
        this.currentUser.set(null);
        return of(null);
      }),
    );
  }

  login(email: string, password: string): Observable<AuthUser> {
    return this.http
      .post<AuthUser>('/api/auth/login', { email, password })
      .pipe(tap((user) => this.currentUser.set(user)));
  }

  register(email: string, password: string): Observable<AuthUser> {
    return this.http
      .post<AuthUser>('/api/auth/register', { email, password })
      .pipe(tap((user) => this.currentUser.set(user)));
  }

  logout(): Observable<void> {
    return this.http.post<void>('/api/auth/logout', {}).pipe(
      tap(() => this.currentUser.set(null)),
      map(() => undefined),
    );
  }
}
