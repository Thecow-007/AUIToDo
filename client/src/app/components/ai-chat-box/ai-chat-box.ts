import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SpeechService } from '../../services/speech.service';
import { VoiceSettingsModal } from '../voice-settings-modal/voice-settings-modal';

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  timestamp: string;
  wasSpoken?: boolean;
  wasSynthesized?: boolean;
}

@Component({
  selector: 'app-ai-chat-box',
  imports: [FormsModule],
  templateUrl: './ai-chat-box.html',
  styleUrl: './ai-chat-box.css',
})
export class AiChatBox {
  speechService = inject(SpeechService);

  inputText = '';

  messages: ChatMessage[] = [
    {
      role: 'ai',
      content: 'Hello! How can I help you manage your tasks today? I noticed "Clean Garage" is due tomorrow.',
      timestamp: '12:01 PM'
    },
    {
      role: 'user',
      content: 'Can you push the due date to this weekend?',
      timestamp: '12:02 PM'
    },
    {
      role: 'ai',
      content: 'Done! I\'ve moved "Clean Garage" to Saturday at 10:00 AM. Want me to adjust any sub-tasks too?',
      timestamp: '12:02 PM'
    }
  ];

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
    const now = new Date();
    const timestamp = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    this.messages.push({
      role: 'user',
      content: text,
      timestamp,
      wasSpoken
    });

    // Simulate AI response after a short delay
    setTimeout(() => {
      const response = 'I\'ll look into that for you. Let me check your task list...';
      const shouldSpeak = this.speechService.shouldSpeak(wasSpoken);

      this.messages.push({
        role: 'ai',
        content: response,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        wasSynthesized: shouldSpeak
      });

      if (shouldSpeak) {
        this.speechService.speak(response);
      }
    }, 800);
  }

  // --- TTS controls ---

  stopSpeaking(): void {
    this.speechService.stopSpeaking();
  }
}
