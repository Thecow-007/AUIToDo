export type ChangeType = 'none' | 'add' | 'update' | 'delete' | 'select' | 'toggle';

export interface FieldChange {
  field: string;
  type: ChangeType;
  oldValue?: string;
  newValue?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  isCompleted: boolean;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  dueDate?: string;
  estimatedDuration?: string;
  energyLevel?: 'Low' | 'Medium' | 'High';
  subTasks?: Task[];

  // Live preview change tracking
  changeType?: ChangeType;
  fieldChanges?: FieldChange[];
}
