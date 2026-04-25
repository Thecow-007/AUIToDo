import { Component, inject } from '@angular/core';
import { TaskNode } from '../task-node/task-node';
import { TaskService } from '../../services/task.service';

@Component({
  selector: 'app-main-content-pane',
  imports: [TaskNode],
  templateUrl: './main-content-pane.html',
  styleUrl: './main-content-pane.css',
})
export class MainContentPane {
  readonly taskService = inject(TaskService);
}
