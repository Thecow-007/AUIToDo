import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-navigation-pane',
  imports: [],
  templateUrl: './navigation-pane.html',
  styleUrl: './navigation-pane.css',
})
export class NavigationPane {
  activeTab = signal<'search' | 'urgent' | 'calendar' | 'all'>('all');

  setActiveTab(tab: 'search' | 'urgent' | 'calendar' | 'all') {
    this.activeTab.set(tab);
  }
}
