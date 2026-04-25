import { Component, inject, signal } from '@angular/core';
import { TaskService } from '../../services/task.service';
import { TaskModalService } from '../../services/task-modal.service';

@Component({
  selector: 'app-navigation-pane',
  imports: [],
  templateUrl: './navigation-pane.html',
  styleUrl: './navigation-pane.css',
})
export class NavigationPane {
  readonly taskService = inject(TaskService);
  private readonly modal = inject(TaskModalService);

  activeTab = signal<'calendar' | 'all'>('all');

  /** Track which nav tree nodes are expanded by task ID */
  expandedIds = signal<Set<string>>(new Set());

  setActiveTab(tab: 'calendar' | 'all') {
    this.activeTab.set(tab);
  }

  isExpanded(id: string): boolean {
    return this.expandedIds().has(id);
  }

  toggleExpand(id: string, event: Event) {
    event.stopPropagation();
    this.expandedIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  openTask(id: string) {
    this.modal.open(id);
  }
}
