import { Injectable, computed, signal } from '@angular/core';
import { PreviewAction, Tag, Task } from '../models/task.model';

@Injectable({ providedIn: 'root' })
export class TaskService {
  private readonly tasksById = signal<Map<string, Task>>(new Map());
  private readonly tagsById = signal<Map<string, Tag>>(new Map());
  private readonly previewByTaskId = signal<Map<string, PreviewAction>>(new Map());

  readonly rootTaskIds = signal<string[]>([]);

  readonly allTasks = computed(() => Array.from(this.tasksById().values()));
  readonly allTags = computed(() => Array.from(this.tagsById().values()));

  getTask(id: string): Task | undefined {
    return this.tasksById().get(id);
  }

  getChildren(parentId: string): Task[] {
    const parent = this.getTask(parentId);
    if (!parent) return [];
    const map = this.tasksById();
    return parent.childIds
      .map((id) => map.get(id))
      .filter((t): t is Task => t !== undefined);
  }

  getTag(id: string): Tag | undefined {
    return this.tagsById().get(id);
  }

  getTagsFor(task: Task): Tag[] {
    const map = this.tagsById();
    return task.tagIds
      .map((id) => map.get(id))
      .filter((t): t is Tag => t !== undefined);
  }

  getPreview(id: string): PreviewAction {
    return this.previewByTaskId().get(id) ?? null;
  }

  setPreview(id: string, action: PreviewAction) {
    const next = new Map(this.previewByTaskId());
    if (action === null) next.delete(id);
    else next.set(id, action);
    this.previewByTaskId.set(next);
  }

  updateTask(id: string, patch: Partial<Task>) {
    const existing = this.getTask(id);
    if (!existing) return;
    const next = new Map(this.tasksById());
    next.set(id, { ...existing, ...patch, updatedAt: new Date() });
    this.tasksById.set(next);
  }

  toggleComplete(id: string) {
    const task = this.getTask(id);
    if (!task) return;
    const targetState = !task.isCompleted;
    const next = new Map(this.tasksById());
    if (targetState) {
      // Cascade complete to all descendants
      const stack = [id];
      while (stack.length) {
        const current = stack.pop()!;
        const t = next.get(current);
        if (!t) continue;
        next.set(current, {
          ...t,
          isCompleted: true,
          completedAt: new Date(),
          updatedAt: new Date(),
        });
        stack.push(...t.childIds);
      }
    } else {
      // Uncheck does NOT cascade — spec §3
      next.set(id, {
        ...task,
        isCompleted: false,
        completedAt: null,
        updatedAt: new Date(),
      });
    }
    this.tasksById.set(next);
  }

  seedDemoData() {
    const now = new Date();
    const tomorrowFivePm = new Date();
    tomorrowFivePm.setDate(tomorrowFivePm.getDate() + 1);
    tomorrowFivePm.setHours(17, 0, 0, 0);

    const tags: Tag[] = [
      { id: 'tag-home', userId: 'demo-user', label: 'home', color: '#22c55e', createdAt: now },
      { id: 'tag-cleanup', userId: 'demo-user', label: 'cleanup', color: '#3b82f6', createdAt: now },
    ];

    const tasks: Task[] = [
      {
        id: 'root-1',
        userId: 'demo-user',
        parentId: null,
        childIds: ['sub-1', 'sub-2', 'sub-3'],
        title: 'Clean Garage',
        description:
          'Sort through all the boxes, organize the tools, and sweep the floor. Make sure to recycle the cardboard.',
        priority: 'medium',
        dueAt: tomorrowFivePm,
        isCompleted: false,
        completedAt: null,
        tagIds: ['tag-home', 'tag-cleanup'],
        recurrenceRuleId: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'sub-1',
        userId: 'demo-user',
        parentId: 'root-1',
        childIds: ['sub-sub-1'],
        title: 'Sort boxes',
        description:
          'Open all unmarked boxes and categorize their contents into Keep, Donate, and Throw Away.',
        priority: 'low',
        dueAt: null,
        isCompleted: true,
        completedAt: now,
        tagIds: [],
        recurrenceRuleId: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'sub-sub-1',
        userId: 'demo-user',
        parentId: 'sub-1',
        childIds: [],
        title: 'Take photos of items to donate',
        description: 'Snap pictures for the local charity pickup.',
        priority: 'medium',
        dueAt: null,
        isCompleted: false,
        completedAt: null,
        tagIds: [],
        recurrenceRuleId: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'sub-2',
        userId: 'demo-user',
        parentId: 'root-1',
        childIds: [],
        title: 'Organize tools',
        description: 'Mount the pegboard and hang wrenches and hammers.',
        priority: 'high',
        dueAt: null,
        isCompleted: false,
        completedAt: null,
        tagIds: [],
        recurrenceRuleId: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'sub-3',
        userId: 'demo-user',
        parentId: 'root-1',
        childIds: [],
        title: 'Sweep floor',
        description: 'Use the push broom to clear out dirt and debris.',
        priority: 'low',
        dueAt: null,
        isCompleted: false,
        completedAt: null,
        tagIds: [],
        recurrenceRuleId: null,
        createdAt: now,
        updatedAt: now,
      },
    ];

    this.tagsById.set(new Map(tags.map((t) => [t.id, t])));
    this.tasksById.set(new Map(tasks.map((t) => [t.id, t])));
    this.rootTaskIds.set(tasks.filter((t) => t.parentId === null).map((t) => t.id));
  }
}
