import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TaskModalService {
  readonly openTaskId = signal<string | null>(null);

  open(taskId: string) {
    this.openTaskId.set(taskId);
  }

  close() {
    this.openTaskId.set(null);
  }
}
