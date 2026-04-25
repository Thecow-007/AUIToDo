export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export type PreviewAction = 'create' | 'update' | 'delete' | null;

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
}

export interface Tag {
  id: string;
  userId: string;
  label: string;
  color: string;
  createdAt: Date;
}
