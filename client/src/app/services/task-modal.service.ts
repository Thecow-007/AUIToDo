import { Injectable, signal } from '@angular/core';
import { Task } from '../models/task.model';

@Injectable({
  providedIn: 'root'
})
export class TaskModalService {
  selectedTask = signal<Task | null>(null);

  openModal(task: Task) {
    this.selectedTask.set(task);
  }

  closeModal() {
    this.selectedTask.set(null);
  }
}
