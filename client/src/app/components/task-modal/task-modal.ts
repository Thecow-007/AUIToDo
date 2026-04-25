import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Task } from '../../models/task.model';
import { MarkdownPipe } from '../../pipes/markdown.pipe';

@Component({
  selector: 'app-task-modal',
  imports: [FormsModule, MarkdownPipe],
  templateUrl: './task-modal.html',
  styleUrl: './task-modal.css'
})
export class TaskModal {
  @Input({ required: true }) task!: Task;
  @Output() close = new EventEmitter<void>();

  isPreview = signal<boolean>(false);

  togglePreview() {
    this.isPreview.set(!this.isPreview());
  }

  closeModal() {
    this.close.emit();
  }

  stopPropagation(event: Event) {
    event.stopPropagation();
  }
}
