import { Component, Input, Output, EventEmitter, forwardRef, signal } from '@angular/core';
import { NgClass, UpperCasePipe } from '@angular/common';
import { Task, ChangeType } from '../../models/task.model';

@Component({
  selector: 'app-task-node',
  imports: [NgClass, UpperCasePipe, forwardRef(() => TaskNode)],
  templateUrl: './task-node.html',
  styleUrl: './task-node.css',
})
export class TaskNode {
  @Input({ required: true }) task!: Task;
  @Input() isRoot: boolean = false;
  @Input() depth: number = 0;

  @Output() taskClicked = new EventEmitter<Task>();

  // Controls visibility of nested subtasks
  isExpanded = signal<boolean>(true);

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
