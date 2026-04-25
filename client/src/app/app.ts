import { Component, inject, signal } from '@angular/core';
import { NavigationPane } from './components/navigation-pane/navigation-pane';
import { MainContentPane } from './components/main-content-pane/main-content-pane';
import { AiChatBox } from './components/ai-chat-box/ai-chat-box';
import { HeaderBar } from './components/header-bar/header-bar';
import { TaskModal } from './components/task-modal/task-modal';
import { TaskService } from './services/task.service';

@Component({
  selector: 'app-root',
  imports: [HeaderBar, NavigationPane, MainContentPane, AiChatBox, TaskModal],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = signal('client');

  constructor() {
    inject(TaskService).seedDemoData();
  }
}
