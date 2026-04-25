export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export type PreviewAction = 'create' | 'update' | 'delete' | null;

export type ChangeType = 'none' | 'add' | 'update' | 'delete' | 'select' | 'toggle';

export interface FieldChange {
  field: string;
  type: ChangeType;
  oldValue?: string;
  newValue?: string;
}

// Shape matches server/models/Todo.js toClientJSON. The trailing changeType /
// fieldChanges are client-only annotations the AI pipeline sets on SSE `preview`
// events and clears on `applied`/`final` — TaskService.previewByTaskId is the
// source of truth for whether a row is in preview; fieldChanges drives the
// per-field diff highlighting (yellow row + old-value strikethrough).
export interface Task {
  id: string;
  userId: string;
  parentId: string | null;
  childIds: string[];
  title: string;
  description: string;
  priority: Priority;
  dueAt: Date | null;
  isCompleted: boolean;
  completedAt: Date | null;
  tagIds: string[];
  recurrenceRuleId: string | null;
  createdAt: Date;
  updatedAt: Date;

  changeType?: ChangeType;
  fieldChanges?: FieldChange[];
}

export interface Tag {
  id: string;
  userId: string;
  label: string;
  color: string;
  createdAt: Date;
}
