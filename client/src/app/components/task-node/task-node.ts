import { Component, Input, Output, EventEmitter, forwardRef, signal, OnInit } from '@angular/core';
import { Task } from '../../models/task.model';

@Component({
  selector: 'app-task-node',
  imports: [forwardRef(() => TaskNode)],
  templateUrl: './task-node.html',
  styleUrl: './task-node.css',
})
export class TaskNode implements OnInit {
  @Input({ required: true }) task!: Task;
  @Input() isRoot: boolean = false;
  @Input() depth: number = 0;

  @Output() taskClicked = new EventEmitter<Task>();

  // Controls visibility of nested subtasks
  isExpanded = signal<boolean>(false);

  ngOnInit() {
    if (this.isRoot) {
      this.isExpanded.set(true);
    }
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
