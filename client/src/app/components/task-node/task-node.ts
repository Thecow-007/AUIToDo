import { Component, Input, Output, EventEmitter, forwardRef, signal, inject } from '@angular/core';
import { NgClass, UpperCasePipe } from '@angular/common';
import { Task, ChangeType } from '../../models/task.model';
import { DragDropService } from '../../services/drag-drop.service';

@Component({
  selector: 'app-task-node',
  imports: [NgClass, UpperCasePipe, forwardRef(() => TaskNode)],
  templateUrl: './task-node.html',
  styleUrl: './task-node.css',
})
export class TaskNode {
  @Input({ required: true }) task!: Task;
  @Input() parentTask: Task | null = null;
  @Input() isRoot: boolean = false;
  @Input() depth: number = 0;

  @Output() taskClicked = new EventEmitter<Task>();

  dragDrop = inject(DragDropService);

  // Controls visibility of nested subtasks
  isExpanded = signal<boolean>(true);
  isDragOver = signal<boolean>(false);

  get changeClass(): string {
    if (!this.task.changeType || this.task.changeType === 'none') return '';
    return 'change-' + this.task.changeType;
  }

  hasFieldChange(field: string): boolean {
    return !!this.task.fieldChanges?.some(fc => fc.field === field);
  }

  getFieldChangeClass(field: string): string {
    const fc = this.task.fieldChanges?.find(f => f.field === field);
    if (!fc) return '';
    return 'field-change-' + fc.type;
  }

  getFieldOldValue(field: string): string | undefined {
    return this.task.fieldChanges?.find(f => f.field === field)?.oldValue;
  }

  // --- Drag & Drop ---

  onDragStart(event: DragEvent) {
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', this.task.id);
    }
    this.dragDrop.startDrag(this.task, this.parentTask);
  }

  onDragEnd(event: DragEvent) {
    this.dragDrop.endDrag();
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }

    const dragged = this.dragDrop.draggedTask();
    if (!dragged || dragged.id === this.task.id) return;

    this.isDragOver.set(true);
  }

  onDragLeave(event: DragEvent) {
    this.isDragOver.set(false);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);

    this.dragDrop.moveTask(this.task);
  }

  // --- Existing interactions ---

  onTaskClick(event: Event) {
    event.stopPropagation();
    this.taskClicked.emit(this.task);
  }

  onChildTaskClick(task: Task) {
    this.taskClicked.emit(task);
  }

  toggleExpand(event: Event) {
    event.stopPropagation();
    this.isExpanded.set(!this.isExpanded());
  }

  toggleCompletion(event: Event) {
    event.stopPropagation();
    this.task.isCompleted = !this.task.isCompleted;
  }
}
