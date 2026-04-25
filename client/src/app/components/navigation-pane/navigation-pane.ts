import { Component, signal } from '@angular/core';

export type NavRoute = 'list' | 'calendar' | 'priority' | 'tags' | 'notifications';

interface NavItem {
  route: NavRoute;
  icon: string;
  label: string;
}

@Component({
  selector: 'app-navigation-pane',
  imports: [],
  templateUrl: './navigation-pane.html',
  styleUrl: './navigation-pane.css',
})
export class NavigationPane {
  // Active route — to be replaced by RouterLink/RouterLinkActive once router is wired
  readonly activeRoute = signal<NavRoute>('list');

  readonly navItems: NavItem[] = [
    { route: 'list', icon: '⊕', label: 'List' },
    { route: 'calendar', icon: '📅', label: 'Calendar' },
    { route: 'priority', icon: '⚡', label: 'Priority' },
    { route: 'tags', icon: '🏷', label: 'Tags' },
  ];

  setActive(route: NavRoute) {
    this.activeRoute.set(route);
  }
}
