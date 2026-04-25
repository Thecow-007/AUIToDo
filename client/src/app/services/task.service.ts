import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { Priority, PreviewAction, Tag, Task } from '../models/task.model';

export interface TaskFilters {
  parentId?: string | null;
  tag?: string;
  status?: 'active' | 'completed' | 'open';
  priority?: Priority[];
  dueFrom?: Date;
  dueTo?: Date;
  q?: string;
}

interface ServerTask {
  id: string;
  userId: string;
  parentId: string | null;
  childIds: string[];
  title: string;
  description: string;
  priority: Priority;
  dueAt: string | null;
  isCompleted: boolean;
  completedAt: string | null;
  tagIds: string[];
  recurrenceRuleId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CompleteResponse {
  todo: ServerTask;
  affected: { todoId: string; prevIsCompleted: boolean; prevCompletedAt: string | null }[];
}

interface PatchResponse {
  before: Partial<Record<keyof Task, unknown>>;
  after: Partial<Record<keyof Task, unknown>>;
  todo: ServerTask;
}

@Injectable({ providedIn: 'root' })
export class TaskService {
  private http = inject(HttpClient);

  private readonly tasksById = signal<Map<string, Task>>(new Map());
  private readonly tagsById = signal<Map<string, Tag>>(new Map());
  private readonly previewByTaskId = signal<Map<string, PreviewAction>>(new Map());

  readonly rootTaskIds = signal<string[]>([]);

  readonly allTasks = computed(() => Array.from(this.tasksById().values()));
  readonly allTags = computed(() => Array.from(this.tagsById().values()));

  // --- reads from local cache (signals drive the UI) ---

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

  // --- HTTP-backed mutations ---

  refresh(filters: TaskFilters = {}): Observable<Task[]> {
    let params = new HttpParams();
    if (filters.parentId !== undefined)
      params = params.set('parentId', filters.parentId === null ? 'null' : filters.parentId);
    if (filters.tag) params = params.set('tag', filters.tag);
    if (filters.status === 'active' || filters.status === 'open') params = params.set('status', 'active');
    else if (filters.status === 'completed') params = params.set('status', 'completed');
    if (filters.dueFrom) params = params.set('dueFrom', filters.dueFrom.toISOString());
    if (filters.dueTo) params = params.set('dueTo', filters.dueTo.toISOString());
    if (filters.q) params = params.set('q', filters.q);

    return this.http.get<ServerTask[]>('/api/todos', { params }).pipe(
      map((docs) => docs.map(deserializeTask)),
      map((tasks) => {
        // Client-side priority filter — backend's GET /api/todos doesn't take priority yet.
        if (filters.priority?.length) {
          const set = new Set(filters.priority);
          return tasks.filter((t) => set.has(t.priority));
        }
        return tasks;
      }),
      tap((tasks) => this.replaceCache(tasks)),
    );
  }

  refreshTags(): Observable<Tag[]> {
    return this.http.get<Tag[]>('/api/tags').pipe(
      map((rawTags) =>
        rawTags.map((t) => ({ ...t, createdAt: new Date(t.createdAt as unknown as string) })),
      ),
      tap((tags) => this.tagsById.set(new Map(tags.map((t) => [t.id, t])))),
    );
  }

  createTask(input: Partial<Task>): Observable<Task> {
    const body: any = {
      title: input.title,
      description: input.description ?? '',
      priority: input.priority ?? 'medium',
    };
    if (input.parentId) body.parentId = input.parentId;
    if (input.dueAt) body.dueAt = input.dueAt;
    if (input.tagIds?.length) body.tagIds = input.tagIds;

    return this.http.post<ServerTask>('/api/todos', body).pipe(
      map(deserializeTask),
      tap((task) => this.upsertTask(task)),
    );
  }

  updateTask(id: string, patch: Partial<Task>): Observable<Task> {
    const body: any = {};
    for (const k of ['title', 'description', 'priority', 'dueAt', 'tagIds', 'parentId'] as const) {
      if (k in patch) body[k] = patch[k];
    }
    return this.http.patch<PatchResponse>(`/api/todos/${id}`, body).pipe(
      map((resp) => deserializeTask(resp.todo)),
      tap((task) => {
        this.upsertTask(task);
        // If parentId changed, refresh both old + new parent's childIds from the server.
        if ('parentId' in patch) {
          this.refresh().subscribe();
        }
      }),
    );
  }

  toggleComplete(id: string): Observable<CompleteResponse> {
    const cur = this.getTask(id);
    if (!cur) throw new Error('task_not_in_cache');
    const isCompleted = !cur.isCompleted;
    return this.http
      .post<CompleteResponse>(`/api/todos/${id}/complete`, { isCompleted })
      .pipe(
        tap((resp) => {
          this.upsertTask(deserializeTask(resp.todo));
          for (const a of resp.affected) {
            if (a.todoId === id) continue;
            const existing = this.tasksById().get(a.todoId);
            if (existing) {
              this.upsertTask({
                ...existing,
                isCompleted,
                completedAt: isCompleted ? new Date() : null,
              });
            }
          }
        }),
      );
  }

  deleteTask(id: string): Observable<{ snapshot: unknown; deletedIds: string[] }> {
    return this.http
      .delete<{ snapshot: unknown; deletedIds: string[] }>(`/api/todos/${id}`)
      .pipe(
        tap((resp) => {
          const next = new Map(this.tasksById());
          for (const did of resp.deletedIds) next.delete(did);
          this.tasksById.set(next);
          this.rootTaskIds.update((ids) => ids.filter((i) => !resp.deletedIds.includes(i)));
        }),
      );
  }

  // --- internal cache maintenance ---

  upsertTask(task: Task) {
    const next = new Map(this.tasksById());
    next.set(task.id, task);
    this.tasksById.set(next);
    if (task.parentId === null && !this.rootTaskIds().includes(task.id)) {
      this.rootTaskIds.update((ids) => [...ids, task.id]);
    }
  }

  private replaceCache(tasks: Task[]) {
    this.tasksById.set(new Map(tasks.map((t) => [t.id, t])));
    this.rootTaskIds.set(tasks.filter((t) => t.parentId === null).map((t) => t.id));
  }
}

function deserializeTask(s: ServerTask): Task {
  return {
    id: s.id,
    userId: s.userId,
    parentId: s.parentId,
    childIds: s.childIds,
    title: s.title,
    description: s.description,
    priority: s.priority,
    dueAt: s.dueAt ? new Date(s.dueAt) : null,
    isCompleted: s.isCompleted,
    completedAt: s.completedAt ? new Date(s.completedAt) : null,
    tagIds: s.tagIds,
    recurrenceRuleId: s.recurrenceRuleId,
    createdAt: new Date(s.createdAt),
    updatedAt: new Date(s.updatedAt),
  };
}
