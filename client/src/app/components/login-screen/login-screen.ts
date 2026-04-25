import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { TaskService } from '../../services/task.service';

@Component({
  selector: 'app-login-screen',
  imports: [FormsModule],
  templateUrl: './login-screen.html',
  styleUrl: './login-screen.css',
})
export class LoginScreen {
  private auth = inject(AuthService);
  private tasks = inject(TaskService);

  email = '';
  password = '';
  mode = signal<'login' | 'register'>('login');
  error = signal<string | null>(null);
  busy = signal(false);

  toggleMode() {
    this.mode.update((m) => (m === 'login' ? 'register' : 'login'));
    this.error.set(null);
  }

  submit() {
    const email = this.email.trim();
    const password = this.password;
    if (!email || !password) {
      this.error.set('Email and password are required.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    const op =
      this.mode() === 'login'
        ? this.auth.login(email, password)
        : this.auth.register(email, password);
    op.subscribe({
      next: () => {
        this.busy.set(false);
        this.tasks.refresh().subscribe();
        this.tasks.refreshTags().subscribe();
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(err?.error?.error ?? err?.message ?? 'Authentication failed.');
      },
    });
  }
}
