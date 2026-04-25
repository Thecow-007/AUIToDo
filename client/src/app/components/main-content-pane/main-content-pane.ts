import { Component, inject } from '@angular/core';
import { Task } from '../../models/task.model';
import { TaskNode } from '../task-node/task-node';
import { TaskModalService } from '../../services/task-modal.service';

@Component({
  selector: 'app-main-content-pane',
  imports: [TaskNode],
  templateUrl: './main-content-pane.html',
  styleUrl: './main-content-pane.css',
})
export class MainContentPane {
  modalService = inject(TaskModalService);

  rootTask: Task = {
    id: 'root-1',
    title: 'Clean Garage',
    description: 'Sort through all the boxes, organize the tools, and sweep the floor. Make sure to recycle the cardboard.',
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

  openModal(task: Task) {
    this.modalService.openModal(task);
  }
}
