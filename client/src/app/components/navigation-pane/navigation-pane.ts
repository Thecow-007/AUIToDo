import { Component, inject, signal } from '@angular/core';
import { TaskService } from '../../services/task.service';
import { TaskModalService } from '../../services/task-modal.service';
import { PageService, AppPage } from '../../services/page.service';

type NavTab = 'search' | 'urgent' | 'calendar' | 'all';

@Component({
  selector: 'app-navigation-pane',
  imports: [],
  templateUrl: './navigation-pane.html',
  styleUrl: './navigation-pane.css',
})
export class NavigationPane {
  readonly taskService = inject(TaskService);
  private readonly modal = inject(TaskModalService);
  private readonly pageService = inject(PageService);

  // Tabs that map to pages drive both the sidebar mini-content AND the active
  // page in the main pane. 'search' is sidebar-only — clicking it does not
  // change the page.
  readonly activeTab = signal<NavTab>('all');

  /** Track which nav tree nodes are expanded by task ID */
  expandedIds = signal<Set<string>>(new Set());

  setActiveTab(tab: NavTab) {
    this.activeTab.set(tab);
    const page = navTabToPage(tab);
    if (page) this.pageService.setPage(page);
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

function navTabToPage(tab: NavTab): AppPage | null {
  switch (tab) {
    case 'all': return 'list';
    case 'calendar': return 'calendar';
    case 'urgent': return 'priority';
    default: return null;
  }
}
