import { Component, computed, inject, signal } from '@angular/core';
import { TaskNode } from '../task-node/task-node';
import { TaskService, TaskFilters } from '../../services/task.service';
import { Priority } from '../../models/task.model';

type DateRange = 'any' | 'today' | 'week' | 'overdue';

@Component({
  selector: 'app-main-content-pane',
  imports: [TaskNode],
  templateUrl: './main-content-pane.html',
  styleUrl: './main-content-pane.css',
})
export class MainContentPane {
  readonly taskService = inject(TaskService);

  readonly allPriorities: Priority[] = ['low', 'medium', 'high', 'urgent'];
  readonly activePriorities = signal<Set<Priority>>(new Set());
  readonly dateRange = signal<DateRange>('any');
  readonly filterPanelOpen = signal(false);

  readonly activeFilterCount = computed(
    () => this.activePriorities().size + (this.dateRange() === 'any' ? 0 : 1),
  );

  toggleFilterPanel() {
    this.filterPanelOpen.update((v) => !v);
  }

  togglePriority(p: Priority) {
    this.activePriorities.update((set) => {
      const next = new Set(set);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
    this.applyFilters();
  }

  setDateRange(r: DateRange) {
    this.dateRange.set(r);
    this.applyFilters();
  }

  clearFilters() {
    this.activePriorities.set(new Set());
    this.dateRange.set('any');
    this.applyFilters();
  }

  private applyFilters() {
    const filters: TaskFilters = {};
    const ps = Array.from(this.activePriorities());
    if (ps.length > 0) filters.priority = ps;

    const now = new Date();
    switch (this.dateRange()) {
      case 'today': {
        const start = new Date(now); start.setHours(0, 0, 0, 0);
        const end = new Date(start); end.setDate(end.getDate() + 1);
        filters.dueFrom = start; filters.dueTo = end;
        break;
      }
      case 'week': {
        const start = new Date(now); start.setHours(0, 0, 0, 0);
        const end = new Date(start); end.setDate(end.getDate() + 7);
        filters.dueFrom = start; filters.dueTo = end;
        break;
      }
      case 'overdue':
        filters.dueTo = now;
        filters.status = 'open';
        break;
    }

    this.taskService.refresh(filters).subscribe();
  }
}
