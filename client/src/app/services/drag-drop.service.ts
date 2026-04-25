import { Injectable, signal } from '@angular/core';
import { Task } from '../models/task.model';

@Injectable({
  providedIn: 'root'
})
export class DragDropService {
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
   * Move the dragged task from its source parent to the target parent.
   * Returns false if the move is invalid (e.g. dropping onto itself or a descendant).
   */
  moveTask(targetParent: Task): boolean {
    const dragged = this.draggedTask();
    const srcParent = this.sourceParent();
    if (!dragged) return false;

    // Can't drop onto itself
    if (dragged.id === targetParent.id) return false;

    // Can't drop onto own descendant (circular reference)
    if (this.isDescendant(dragged, targetParent)) return false;

    // Can't drop onto current parent (no-op)
    if (srcParent && srcParent.id === targetParent.id) return false;

    // Remove from source
    if (srcParent && srcParent.subTasks) {
      srcParent.subTasks = srcParent.subTasks.filter(t => t.id !== dragged.id);
    }

    // Add to target
    if (!targetParent.subTasks) {
      targetParent.subTasks = [];
    }
    targetParent.subTasks.push(dragged);

    this.endDrag();
    return true;
  }

  /** Check if `potentialChild` is a descendant of `task` */
  private isDescendant(task: Task, potentialChild: Task): boolean {
    if (!task.subTasks) return false;
    for (const sub of task.subTasks) {
      if (sub.id === potentialChild.id) return true;
      if (this.isDescendant(sub, potentialChild)) return true;
    }
    return false;
  }
}
