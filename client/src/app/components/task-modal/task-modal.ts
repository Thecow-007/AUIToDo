import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { Priority } from '../../models/task.model';
import { TaskService } from '../../services/task.service';
import { TaskModalService } from '../../services/task-modal.service';
import { MarkdownPipe } from '../../pipes/markdown.pipe';

const KEYSTROKE_DEBOUNCE_MS = 300;

@Component({
  selector: 'app-task-modal',
  imports: [FormsModule, MarkdownPipe],
  templateUrl: './task-modal.html',
  styleUrl: './task-modal.css',
})
export class TaskModal {
  private readonly taskService = inject(TaskService);
  private readonly modal = inject(TaskModalService);

  readonly priorities: Priority[] = ['low', 'medium', 'high', 'urgent'];
  readonly isPreview = signal<boolean>(false);

  // Debounced keystroke fields. Each keystroke optimistically updates the local
  // cache so the modal/Preview pane react immediately, then a debounced PATCH
  // persists to the server. close() flushes any pending edit.
  private readonly titleEdits$ = new Subject<{ id: string; value: string }>();
  private readonly descEdits$ = new Subject<{ id: string; value: string }>();
  private pendingTitle: { id: string; value: string } | null = null;
  private pendingDesc: { id: string; value: string } | null = null;

  constructor() {
    this.titleEdits$
      .pipe(debounceTime(KEYSTROKE_DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe(({ id, value }) => {
        this.pendingTitle = null;
        this.taskService.updateTask(id, { title: value }).subscribe();
      });

    this.descEdits$
      .pipe(debounceTime(KEYSTROKE_DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe(({ id, value }) => {
        this.pendingDesc = null;
        this.taskService.updateTask(id, { description: value }).subscribe();
      });
  }

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

  togglePreview() {
    this.isPreview.update((v) => !v);
  }

  close() {
    this.flushPending();
    this.modal.close();
  }

  onBackdropClick() {
    this.close();
  }

  stopPropagation(event: Event) {
    event.stopPropagation();
  }

  onTitleChange(value: string) {
    const t = this.task();
    if (!t) return;
    this.taskService.upsertTask({ ...t, title: value });
    this.pendingTitle = { id: t.id, value };
    this.titleEdits$.next({ id: t.id, value });
  }

  onDescriptionChange(value: string) {
    const t = this.task();
    if (!t) return;
    this.taskService.upsertTask({ ...t, description: value });
    this.pendingDesc = { id: t.id, value };
    this.descEdits$.next({ id: t.id, value });
  }

  private flushPending() {
    if (this.pendingTitle) {
      const { id, value } = this.pendingTitle;
      this.pendingTitle = null;
      this.taskService.updateTask(id, { title: value }).subscribe();
    }
    if (this.pendingDesc) {
      const { id, value } = this.pendingDesc;
      this.pendingDesc = null;
      this.taskService.updateTask(id, { description: value }).subscribe();
    }
  }

  onStatusChange(isCompleted: boolean) {
    const id = this.task()?.id;
    if (!id) return;
    if (isCompleted !== this.task()!.isCompleted) {
      this.taskService.toggleComplete(id).subscribe();
    }
  }

  onPriorityChange(value: Priority) {
    const id = this.task()?.id;
    if (id) this.taskService.updateTask(id, { priority: value }).subscribe();
  }

  onDueAtChange(value: string) {
    const id = this.task()?.id;
    if (!id) return;
    this.taskService.updateTask(id, { dueAt: value ? new Date(value) : null }).subscribe();
  }

  toggleTag(tagId: string, isOn: boolean) {
    const t = this.task();
    if (!t) return;
    const next = isOn
      ? Array.from(new Set([...t.tagIds, tagId]))
      : t.tagIds.filter((id) => id !== tagId);
    this.taskService.updateTask(t.id, { tagIds: next }).subscribe();
  }

  isTagOn(tagId: string): boolean {
    return this.task()?.tagIds.includes(tagId) ?? false;
  }

  deleteTask() {
    const t = this.task();
    if (!t) return;
    if (window.confirm(`Are you sure you want to delete "${t.title}"?`)) {
      this.taskService.deleteTask(t.id).subscribe(() => {
        this.close();
      });
    }
  }
}
