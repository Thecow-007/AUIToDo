import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Task } from '../../models/task.model';
import { TaskNode } from '../task-node/task-node';
import { TaskModalService } from '../../services/task-modal.service';

@Component({
  selector: 'app-main-content-pane',
  imports: [TaskNode, FormsModule],
  templateUrl: './main-content-pane.html',
  styleUrl: './main-content-pane.css',
})
export class MainContentPane {
  modalService = inject(TaskModalService);

  isFilterExpanded = signal(false);
  searchQuery = signal('');
  statusFilter = signal<string>('any');
  priorityFilter = signal<string>('any');
  energyFilter = signal<string>('any');

  rootTask: Task = {
    id: 'root-1',
    title: 'Clean Garage',
    description: '## Steps\n\n1. **Sort** through all the boxes\n2. **Organize** the tools on the pegboard\n3. Sweep the floor\n\n> Make sure to recycle the cardboard!\n\nSee the [recycling guide](https://example.com) for details.',
    isCompleted: false,
    priority: 'Medium',
    dueDate: 'Tomorrow, 5:00 PM',
    estimatedDuration: '2 hrs',
    energyLevel: 'High',
    subTasks: [
      {
        id: 'sub-1',
        title: 'Sort boxes',
        description: 'Open all unmarked boxes and categorize their contents into Keep, Donate, and Throw Away.',
        isCompleted: true,
        priority: 'Low',
        estimatedDuration: '45 mins',
        energyLevel: 'Medium',
        changeType: 'select',
        subTasks: [
          {
            id: 'sub-sub-1',
            title: 'Take photos of items to donate',
            description: 'Snap pictures for the local charity pickup.',
            isCompleted: false,
            priority: 'Medium',
            energyLevel: 'Low',
            changeType: 'toggle'
          }
        ]
      },
      {
        id: 'sub-2',
        title: 'Organize tools',
        description: 'Mount the pegboard and hang wrenches and hammers.',
        isCompleted: false,
        priority: 'Urgent',
        dueDate: 'Today, 3:00 PM',
        estimatedDuration: '1 hr',
        energyLevel: 'High',
        changeType: 'update',
        fieldChanges: [
          { field: 'priority', type: 'update', oldValue: 'High', newValue: 'Urgent' },
          { field: 'dueDate', type: 'update', oldValue: 'Tomorrow', newValue: 'Today, 3:00 PM' }
        ]
      },
      {
        id: 'sub-3',
        title: 'Sweep floor',
        description: 'Use the push broom to clear out dirt and debris.',
        isCompleted: false,
        priority: 'Low',
        estimatedDuration: '15 mins',
        energyLevel: 'Low',
        changeType: 'delete'
      },
      {
        id: 'sub-4',
        title: 'Recycle cardboard',
        description: 'Break down all boxes and take them to the recycling bin.',
        isCompleted: false,
        priority: 'Low',
        estimatedDuration: '20 mins',
        energyLevel: 'Low',
        changeType: 'add'
      }
    ]
  };

  filteredRootTask = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const status = this.statusFilter();
    const priority = this.priorityFilter();
    const energy = this.energyFilter();

    // If no filters are active, return the raw tree
    if (!q && status === 'any' && priority === 'any' && energy === 'any') {
      return this.rootTask;
    }

    const filterNode = (node: Task): Task | null => {
      let matches = true;

      // 1. Check keyword
      if (q) {
        const titleMatch = node.title.toLowerCase().includes(q);
        const descMatch = node.description ? node.description.toLowerCase().includes(q) : false;
        if (!titleMatch && !descMatch) matches = false;
      }

      // 2. Check status (assuming isCompleted logic for 'To Do' vs 'Done' for now since mock data uses isCompleted instead of actual 'status')
      // Note: mock data currently only uses `isCompleted`. Real backend would use `status`.
      if (status !== 'any') {
        if (status === 'Done' && !node.isCompleted) matches = false;
        if ((status === 'To Do' || status === 'In Progress') && node.isCompleted) matches = false;
      }

      // 3. Check priority
      if (priority !== 'any' && node.priority?.toLowerCase() !== priority.toLowerCase()) {
        matches = false;
      }

      // 4. Check energy
      if (energy !== 'any' && node.energyLevel?.toLowerCase() !== energy.toLowerCase()) {
        matches = false;
      }

      // Check children recursively
      let matchingChildren: Task[] = [];
      if (node.subTasks && node.subTasks.length > 0) {
        for (const child of node.subTasks) {
          const filteredChild = filterNode(child);
          if (filteredChild) {
            matchingChildren.push(filteredChild);
          }
        }
      }

      // "Path-to-match": Keep node if it matches OR if any of its descendants match
      if (matches || matchingChildren.length > 0) {
        return {
          ...node,
          subTasks: matchingChildren
        };
      }

      return null;
    };

    const result = filterNode(this.rootTask);
    
    // If the root task itself got completely filtered out, we'll just return a dummy empty root
    // to prevent UI crashes, though normally you'd show an empty state.
    if (!result) {
      return { ...this.rootTask, subTasks: [] };
    }
    
    return result;
  });

  openModal(task: Task) {
    this.modalService.openModal(task);
  }
}
