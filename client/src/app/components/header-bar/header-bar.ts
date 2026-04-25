import { Component, inject } from '@angular/core';
import { ChatPanelService } from '../../services/chat-panel.service';
import { ProfileService } from '../../services/profile.service';

@Component({
  selector: 'app-header-bar',
  imports: [],
  templateUrl: './header-bar.html',
  styleUrl: './header-bar.css',
})
export class HeaderBar {
  chatPanel = inject(ChatPanelService);
  profileService = inject(ProfileService);
}
