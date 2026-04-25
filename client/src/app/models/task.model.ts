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
}
