import { Component, inject, signal } from '@angular/core';
import { ChatPanelService } from '../../services/chat-panel.service';
import { ProfileService } from '../../services/profile.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-header-bar',
  imports: [],
  templateUrl: './header-bar.html',
  styleUrl: './header-bar.css',
})
export class HeaderBar {
  chatPanel = inject(ChatPanelService);
  profileService = inject(ProfileService);
  auth = inject(AuthService);

  // TODO: replace with NotificationsService — polls /api/notifications/unread-count every 30s (spec §7)
  readonly unreadCount = signal(0);

  onLogOut() {
    this.auth.logout().subscribe();
  }
}
