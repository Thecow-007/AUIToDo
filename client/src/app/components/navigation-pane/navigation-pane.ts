import { Component, inject, signal } from '@angular/core';
import { PageService, AppPage } from '../../services/page.service';

type NavTab = 'search' | 'urgent' | 'calendar' | 'all';

@Component({
  selector: 'app-navigation-pane',
  imports: [],
  templateUrl: './navigation-pane.html',
  styleUrl: './navigation-pane.css',
})
export class NavigationPane {
  private readonly pageService = inject(PageService);

  // Tabs that map to pages drive both the sidebar mini-content AND the active
  // page in the main pane. 'search' is sidebar-only — clicking it does not
  // change the page.
  readonly activeTab = signal<NavTab>('all');

  setActiveTab(tab: NavTab) {
    this.activeTab.set(tab);
    const page = navTabToPage(tab);
    if (page) this.pageService.setPage(page);
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
