import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SpeechService } from '../../services/speech.service';
import { AiChatService } from '../../services/ai-chat.service';

export interface TrailStep {
  label: string;
  toolName?: string;
}

export interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  timestamp: string;
  wasSpoken?: boolean;
  wasSynthesized?: boolean;
  trail?: TrailStep[];
  trailCollapsed?: boolean;
}

@Component({
  selector: 'app-ai-chat-box',
  imports: [FormsModule],
  templateUrl: './ai-chat-box.html',
  styleUrl: './ai-chat-box.css',
})
export class AiChatBox {
  speechService = inject(SpeechService);
  private aiChat = inject(AiChatService);

  inputText = '';
  readonly messages = signal<ChatMessage[]>([]);

  // --- Push-to-Talk ---

  onMicDown(): void {
    this.speechService.startListening();
  }

  onMicUp(): void {
    const transcript = this.speechService.stopListening();
    if (transcript) {
      this.sendMessage(transcript, true);
    }
  }

  // --- Sending ---

  onSendClick(): void {
    if (this.inputText.trim()) {
      this.sendMessage(this.inputText.trim(), false);
      this.inputText = '';
    }
  }

  onInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.onSendClick();
    }
  }

  private sendMessage(text: string, wasSpoken: boolean): void {
    const timestamp = nowTimestamp();
    this.messages.update((m) => [...m, { role: 'user', content: text, timestamp, wasSpoken }]);

    const aiMsg: ChatMessage = {
      role: 'ai',
      content: '',
      timestamp: nowTimestamp(),
      trail: [],
      trailCollapsed: false,
    };
    this.messages.update((m) => [...m, aiMsg]);
    const aiIndex = this.messages().length - 1;

    const history = this.messages()
      .slice(0, -1)
      .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));

    this.aiChat.send(text, history).subscribe({
      next: (event) => {
        this.messages.update((all) => {
          const next = [...all];
          const cur = { ...next[aiIndex] };
          switch (event.type) {
            case 'trail_step':
              cur.trail = [...(cur.trail ?? []), { label: event.label, toolName: event.toolName }];
              break;
            case 'final':
              cur.content = event.message;
              cur.trailCollapsed = true;
              if (this.speechService.shouldSpeak(wasSpoken)) {
                cur.wasSynthesized = true;
                this.speechService.speak(event.message);
              }
              break;
            case 'error':
              cur.content = `⚠ ${event.message}`;
              cur.trailCollapsed = true;
              break;
          }
          next[aiIndex] = cur;
          return next;
        });
      },
    });
  }

  stopSpeaking(): void {
    this.speechService.stopSpeaking();
  }
}

function nowTimestamp(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
