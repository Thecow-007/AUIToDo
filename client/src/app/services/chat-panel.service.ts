import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ChatPanelService {
  isVisible = signal<boolean>(true);
  isCollapsed = signal<boolean>(false);
  panelHeight = signal<number>(280);

  toggle() {
    this.isVisible.set(!this.isVisible());
  }

  toggleCollapse() {
    this.isCollapsed.set(!this.isCollapsed());
  }
}
