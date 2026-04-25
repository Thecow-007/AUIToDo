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
        subTasks: [
          {
            id: 'sub-sub-1',
            title: 'Take photos of items to donate',
            description: 'Snap pictures for the local charity pickup.',
            isCompleted: false,
            priority: 'Medium',
            energyLevel: 'Low'
          }
        ]
      },
      {
        id: 'sub-2',
        title: 'Organize tools',
        description: 'Mount the pegboard and hang wrenches and hammers.',
        isCompleted: false,
        priority: 'High',
        estimatedDuration: '1 hr',
        energyLevel: 'High'
      },
      {
        id: 'sub-3',
        title: 'Sweep floor',
        description: 'Use the push broom to clear out dirt and debris.',
        isCompleted: false,
        priority: 'Low',
        estimatedDuration: '15 mins',
        energyLevel: 'Low'
      }
    ]
  };

  openModal(task: Task) {
    this.modalService.openModal(task);
  }
}
