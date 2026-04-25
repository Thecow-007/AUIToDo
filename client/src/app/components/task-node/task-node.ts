import { Component, Input, computed, forwardRef, inject, signal, OnInit } from '@angular/core';
import { DatePipe, NgClass, UpperCasePipe } from '@angular/common';
import { Task } from '../../models/task.model';
import { TaskService } from '../../services/task.service';
import { TaskModalService } from '../../services/task-modal.service';
import { DragDropService } from '../../services/drag-drop.service';

@Component({
  selector: 'app-task-node',
  imports: [forwardRef(() => TaskNode), DatePipe, NgClass, UpperCasePipe],
  templateUrl: './task-node.html',
  styleUrl: './task-node.css',
})
export class TaskNode implements OnInit {
  @Input({ required: true }) task!: Task;
  @Input() parentTask: Task | null = null;
  @Input() isRoot = false;
  @Input() depth = 0;

  private readonly taskService = inject(TaskService);
  private readonly modal = inject(TaskModalService);
  dragDrop = inject(DragDropService);

  readonly isExpanded = signal(false);
  readonly isDragOver = signal<boolean>(false);

  readonly children = computed(() => this.taskService.getChildren(this.task.id));
  readonly tags = computed(() => this.taskService.getTagsFor(this.task));
  readonly preview = computed(() => this.taskService.getPreview(this.task.id));

  ngOnInit() {
    if (this.isRoot) this.isExpanded.set(true);
  }

  get changeClass(): string {
    if (!this.task.changeType || this.task.changeType === 'none') return '';
    return 'change-' + this.task.changeType;
  }

  hasFieldChange(field: string): boolean {
    return !!this.task.fieldChanges?.some((fc) => fc.field === field);
  }

  getFieldChangeClass(field: string): string {
    const fc = this.task.fieldChanges?.find((f) => f.field === field);
    if (!fc) return '';
    return 'field-change-' + fc.type;
  }

  getFieldOldValue(field: string): string | undefined {
    return this.task.fieldChanges?.find((f) => f.field === field)?.oldValue;
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

  onDragEnd(_event: DragEvent) {
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

  onDragLeave(_event: DragEvent) {
    this.isDragOver.set(false);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);
    this.dragDrop.moveTask(this.task);
  }

  // --- Click / interactions ---

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
    this.taskService.toggleComplete(this.task.id).subscribe();
  }
}
