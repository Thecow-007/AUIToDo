import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Priority } from '../../models/task.model';
import { TaskService } from '../../services/task.service';
import { TaskModalService } from '../../services/task-modal.service';

@Component({
  selector: 'app-task-modal',
  imports: [FormsModule],
  templateUrl: './task-modal.html',
  styleUrl: './task-modal.css',
})
export class TaskModal {
  private readonly taskService = inject(TaskService);
  private readonly modal = inject(TaskModalService);

  readonly priorities: Priority[] = ['low', 'medium', 'high', 'urgent'];

  readonly task = computed(() => {
    const id = this.modal.openTaskId();
    return id ? this.taskService.getTask(id) : undefined;
  });

  readonly currentTags = computed(() => {
    const t = this.task();
    return t ? this.taskService.getTagsFor(t) : [];
  });

  readonly availableTags = computed(() => this.taskService.allTags());

  readonly dueAtInputValue = computed(() => {
    const due = this.task()?.dueAt;
    if (!due) return '';
    const d = new Date(due);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  close() {
    this.modal.close();
  }

  onBackdropClick() {
    this.close();
  }

  stopPropagation(event: Event) {
    event.stopPropagation();
  }

  onTitleChange(value: string) {
    const id = this.task()?.id;
    if (id) this.taskService.updateTask(id, { title: value });
  }

  onDescriptionChange(value: string) {
    const id = this.task()?.id;
    if (id) this.taskService.updateTask(id, { description: value });
  }

  onStatusChange(isCompleted: boolean) {
    const id = this.task()?.id;
    if (!id) return;
    if (isCompleted !== this.task()!.isCompleted) {
      this.taskService.toggleComplete(id);
    }
  }

  onPriorityChange(value: Priority) {
    const id = this.task()?.id;
    if (id) this.taskService.updateTask(id, { priority: value });
  }

  onDueAtChange(value: string) {
    const id = this.task()?.id;
    if (!id) return;
    this.taskService.updateTask(id, { dueAt: value ? new Date(value) : null });
  }

  toggleTag(tagId: string, isOn: boolean) {
    const t = this.task();
    if (!t) return;
    const next = isOn
      ? Array.from(new Set([...t.tagIds, tagId]))
      : t.tagIds.filter((id) => id !== tagId);
    this.taskService.updateTask(t.id, { tagIds: next });
  }

  isTagOn(tagId: string): boolean {
    return this.task()?.tagIds.includes(tagId) ?? false;
  }
}
