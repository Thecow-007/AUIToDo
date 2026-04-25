import { Component, EventEmitter, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SpeechService, TtsMode } from '../../services/speech.service';

@Component({
  selector: 'app-voice-settings-modal',
  imports: [FormsModule],
  templateUrl: './voice-settings-modal.html',
  styleUrl: './voice-settings-modal.css'
})
export class VoiceSettingsModal {
  @Output() close = new EventEmitter<void>();

  speechService = inject(SpeechService);

  get ttsMode(): TtsMode {
    return this.speechService.ttsMode();
  }

  set ttsMode(value: TtsMode) {
    this.speechService.setTtsMode(value);
  }

  get selectedVoiceURI(): string {
    return this.speechService.selectedVoiceURI();
  }

  set selectedVoiceURI(value: string) {
    this.speechService.setSelectedVoice(value);
  }

  previewVoice(): void {
    this.speechService.previewVoice(this.selectedVoiceURI);
  }

  closeModal(): void {
    this.close.emit();
  }

  stopPropagation(event: Event): void {
    event.stopPropagation();
  }
}
