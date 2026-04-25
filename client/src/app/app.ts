import { Component, signal, inject, HostListener, OnInit } from '@angular/core';
import { NavigationPane } from './components/navigation-pane/navigation-pane';
import { MainContentPane } from './components/main-content-pane/main-content-pane';
import { AiChatBox } from './components/ai-chat-box/ai-chat-box';
import { HeaderBar } from './components/header-bar/header-bar';
import { TaskModal } from './components/task-modal/task-modal';
import { VoiceSettingsModal } from './components/voice-settings-modal/voice-settings-modal';
import { LoginScreen } from './components/login-screen/login-screen';
import { ChatPanelService } from './services/chat-panel.service';
import { SpeechService } from './services/speech.service';
import { AuthService } from './services/auth.service';
import { TaskService } from './services/task.service';

@Component({
  selector: 'app-root',
  imports: [HeaderBar, NavigationPane, MainContentPane, AiChatBox, TaskModal, VoiceSettingsModal, LoginScreen],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  chatPanel = inject(ChatPanelService);
  speechService = inject(SpeechService);
  auth = inject(AuthService);
  private tasks = inject(TaskService);
  protected readonly title = signal('client');

  private isResizing = false;

  ngOnInit() {
    // Probe session on boot; if logged in, fetch the user's tree + tags.
    this.auth.refreshMe().subscribe((user) => {
      if (user) {
        this.tasks.refresh().subscribe();
        this.tasks.refreshTags().subscribe();
      }
    });
  }

  onResizeStart(event: MouseEvent) {
    event.preventDefault();
    this.isResizing = true;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }

  @HostListener('window:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (!this.isResizing) return;
    const windowHeight = window.innerHeight;
    const newHeight = windowHeight - event.clientY - 16; // 16px for bottom padding
    const clamped = Math.max(100, Math.min(newHeight, windowHeight * 0.6));
    this.chatPanel.panelHeight.set(clamped);
  }

  @HostListener('window:mouseup')
  onMouseUp() {
    if (this.isResizing) {
      this.isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  }
}
