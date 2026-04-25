import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-header-bar',
  imports: [],
  templateUrl: './header-bar.html',
  styleUrl: './header-bar.css',
})
export class HeaderBar {
  // TODO: replace with NotificationsService — polls /api/notifications/unread-count every 30s (spec §7)
  readonly unreadCount = signal(0);
}
