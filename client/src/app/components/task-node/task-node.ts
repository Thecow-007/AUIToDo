import { Component, Input, computed, forwardRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Task } from '../../models/task.model';
import { TaskService } from '../../services/task.service';
import { TaskModalService } from '../../services/task-modal.service';

@Component({
  selector: 'app-task-node',
  imports: [forwardRef(() => TaskNode), DatePipe],
  templateUrl: './task-node.html',
  styleUrl: './task-node.css',
})
export class TaskNode {
  @Input({ required: true }) task!: Task;
  @Input() isRoot = false;
  @Input() depth = 0;

  private readonly taskService = inject(TaskService);
  private readonly modal = inject(TaskModalService);

  readonly isExpanded = signal(false);

  readonly children = computed(() => this.taskService.getChildren(this.task.id));
  readonly tags = computed(() => this.taskService.getTagsFor(this.task));
  readonly preview = computed(() => this.taskService.getPreview(this.task.id));

  ngOnInit() {
    if (this.isRoot) this.isExpanded.set(true);
  }

  openModal(event: Event) {
    event.stopPropagation();
    this.modal.open(this.task.id);
  }

  toggleExpand(event: Event) {
    event.stopPropagation();
    this.isExpanded.update((v) => !v);
  }

  toggleCompletion(event: Event) {
    event.stopPropagation();
    this.taskService.toggleComplete(this.task.id);
  }
}
