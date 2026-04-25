import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-navigation-pane',
  imports: [],
  templateUrl: './navigation-pane.html',
  styleUrl: './navigation-pane.css',
})
export class NavigationPane {
  activeTab = signal<'calendar' | 'all'>('all');

  setActiveTab(tab: 'calendar' | 'all') {
    this.activeTab.set(tab);
  }
}
