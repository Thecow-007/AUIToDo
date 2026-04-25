import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TaskNode } from '../task-node/task-node';
import { TaskService, TaskFilters } from '../../services/task.service';
import { Priority, Task } from '../../models/task.model';
import { TaskModalService } from '../../services/task-modal.service';

@Component({
  selector: 'app-main-content-pane',
  imports: [TaskNode, FormsModule],
  templateUrl: './main-content-pane.html',
  styleUrl: './main-content-pane.css',
})
export class MainContentPane {
  readonly taskService = inject(TaskService);

  isFilterExpanded = signal(false);
  searchQuery = signal('');
  statusFilter = signal<string>('any');
  priorityFilter = signal<string>('any');

  viewTitle = computed(() => {
    if (this.searchQuery().trim() || this.statusFilter() !== 'any' || this.priorityFilter() !== 'any') {
      return 'Search Results';
    }
    return 'All Tasks';
  });

  toggleFilterPanel() {
    this.isFilterExpanded.update((v) => !v);
  }

  applyFilters() {
    const filters: TaskFilters = {};
    
    const q = this.searchQuery().trim();
    if (q) filters.q = q;

    const s = this.statusFilter();
    if (s === 'To Do' || s === 'In Progress') filters.status = 'active';
    else if (s === 'Done') filters.status = 'completed';

    const p = this.priorityFilter();
    if (p !== 'any') {
      filters.priority = [p.toLowerCase() as Priority];
    }

    this.taskService.refresh(filters).subscribe();
  }

  clearFilters() {
    this.searchQuery.set('');
    this.statusFilter.set('any');
    this.priorityFilter.set('any');
    this.applyFilters();
  }

  private readonly modal = inject(TaskModalService);

  createNewRootTask() {
    this.taskService.createTask({ title: 'New Task' }).subscribe(task => {
      this.modal.open(task.id);
    });
  }
}
