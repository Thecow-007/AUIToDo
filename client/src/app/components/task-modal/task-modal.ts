import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Task } from '../../models/task.model';

@Component({
  selector: 'app-task-modal',
  imports: [FormsModule],
  templateUrl: './task-modal.html',
  styleUrl: './task-modal.css'
})
export class TaskModal {
  @Input({ required: true }) task!: Task;
  @Output() close = new EventEmitter<void>();

  closeModal() {
    this.close.emit();
  }

  stopPropagation(event: Event) {
    event.stopPropagation();
  }
}
