import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ChatPanelService {
  isVisible = signal<boolean>(true);
  panelHeight = signal<number>(280);

  toggle() {
    this.isVisible.set(!this.isVisible());
  }
}
