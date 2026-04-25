import { Injectable, inject, signal } from '@angular/core';
import { Task } from '../models/task.model';
import { TaskService } from './task.service';

@Injectable({
  providedIn: 'root'
})
export class DragDropService {
  private taskService = inject(TaskService);

  draggedTask = signal<Task | null>(null);
  sourceParent = signal<Task | null>(null);

  startDrag(task: Task, parent: Task | null) {
    this.draggedTask.set(task);
    this.sourceParent.set(parent);
  }

  endDrag() {
    this.draggedTask.set(null);
    this.sourceParent.set(null);
  }

  /**
   * Move the dragged task to become a child of `targetParent`. Returns false on
   * client-side validation failure (drop on self, on own descendant, or no-op).
   * On success, PATCHes /api/todos/:id with the new parentId. The server runs the
   * authoritative circular-reference check; this guard is just for UX feedback.
   */
  moveTask(targetParent: Task): boolean {
    const dragged = this.draggedTask();
    const srcParent = this.sourceParent();
    if (!dragged) return false;

    if (dragged.id === targetParent.id) return false;
    if (this.isDescendantOf(dragged.id, targetParent.id)) return false;
    if (srcParent && srcParent.id === targetParent.id) return false;

    this.taskService.updateTask(dragged.id, { parentId: targetParent.id }).subscribe({
      error: () => {
        // Server rejected (e.g. a circular ref this guard missed) — resync from server.
        this.taskService.refresh().subscribe();
      },
    });

    this.endDrag();
    return true;
  }

  /** True if `candidateId` is in the subtree rooted at `ancestorId` (per TaskService cache). */
  private isDescendantOf(ancestorId: string, candidateId: string): boolean {
    const stack = [ancestorId];
    const seen = new Set<string>();
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const task = this.taskService.getTask(cur);
      if (!task) continue;
      for (const childId of task.childIds) {
        if (childId === candidateId) return true;
        stack.push(childId);
      }
    }
    return false;
  }
}
