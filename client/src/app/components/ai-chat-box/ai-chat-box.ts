import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface TrailStep {
  label: string;
  toolName?: string;
}

export type ChatMessage =
  | { kind: 'user'; text: string }
  | { kind: 'ai'; text: string; trail?: TrailStep[]; trailCollapsed?: boolean };

@Component({
  selector: 'app-ai-chat-box',
  imports: [FormsModule],
  templateUrl: './ai-chat-box.html',
  styleUrl: './ai-chat-box.css',
})
export class AiChatBox {
  readonly messages = signal<ChatMessage[]>([]);
  readonly draft = signal('');
  readonly isExpanded = signal(false);

  expand() {
    this.isExpanded.set(true);
  }

  send() {
    const text = this.draft().trim();
    if (!text) return;
    this.messages.update((m) => [...m, { kind: 'user', text }]);
    this.draft.set('');
    this.expand();
    // TODO: POST to /api/ai/chat and stream SSE events into messages
  }
}
