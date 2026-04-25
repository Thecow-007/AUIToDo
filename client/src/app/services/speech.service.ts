import { Injectable, signal } from '@angular/core';

export type TtsMode = 'off' | 'spoken-only' | 'always';

const STORAGE_KEY_TTS_MODE = 'voice_tts_mode';
const STORAGE_KEY_VOICE_URI = 'voice_selected_uri';

@Injectable({
  providedIn: 'root'
})
export class SpeechService {

  // --- Feature detection ---
  readonly sttSupported: boolean;
  readonly ttsSupported: boolean;

  // --- STT state ---
  isListening = signal(false);
  interimTranscript = signal('');
  private recognition: any = null;
  private finalTranscript = '';

  // --- TTS state ---
  isSpeaking = signal(false);

  // --- Settings ---
  isSettingsOpen = signal(false);
  ttsMode = signal<TtsMode>(this.loadTtsMode());
  selectedVoiceURI = signal<string>(this.loadVoiceURI());
  availableVoices = signal<SpeechSynthesisVoice[]>([]);

  constructor() {
    // STT detection
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.sttSupported = !!SpeechRecognition;

    if (this.sttSupported) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }
        if (final) {
          this.finalTranscript += final;
        }
        this.interimTranscript.set(this.finalTranscript + interim);
      };

      this.recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        this.isListening.set(false);
      };

      this.recognition.onend = () => {
        this.isListening.set(false);
      };
    }

    // TTS detection
    this.ttsSupported = 'speechSynthesis' in window;

    if (this.ttsSupported) {
      this.loadVoices();
      // Voices may load asynchronously in some browsers
      speechSynthesis.onvoiceschanged = () => this.loadVoices();
    }
  }

  // --- STT Methods ---

  startListening(): void {
    if (!this.sttSupported || this.isListening()) return;

    this.finalTranscript = '';
    this.interimTranscript.set('');
    this.isListening.set(true);

    try {
      this.recognition.start();
    } catch (e) {
      console.warn('Failed to start recognition:', e);
      this.isListening.set(false);
    }
  }

  stopListening(): string {
    if (!this.sttSupported || !this.isListening()) return '';

    try {
      this.recognition.stop();
    } catch (e) {
      // May already be stopped
    }

    this.isListening.set(false);

    const result = this.interimTranscript() || this.finalTranscript;
    this.interimTranscript.set('');
    this.finalTranscript = '';
    return result.trim();
  }

  // --- TTS Methods ---

  speak(text: string): void {
    if (!this.ttsSupported || this.ttsMode() === 'off') return;

    // Cancel any in-progress speech
    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Apply selected voice
    const voiceURI = this.selectedVoiceURI();
    if (voiceURI) {
      const voice = this.availableVoices().find(v => v.voiceURI === voiceURI);
      if (voice) {
        utterance.voice = voice;
      }
    }

    utterance.onstart = () => this.isSpeaking.set(true);
    utterance.onend = () => this.isSpeaking.set(false);
    utterance.onerror = () => this.isSpeaking.set(false);

    speechSynthesis.speak(utterance);
  }

  stopSpeaking(): void {
    if (!this.ttsSupported) return;
    speechSynthesis.cancel();
    this.isSpeaking.set(false);
  }

  shouldSpeak(wasSpoken: boolean): boolean {
    const mode = this.ttsMode();
    if (mode === 'off') return false;
    if (mode === 'always') return true;
    return wasSpoken; // 'spoken-only'
  }

  // --- Settings persistence ---

  setTtsMode(mode: TtsMode): void {
    this.ttsMode.set(mode);
    localStorage.setItem(STORAGE_KEY_TTS_MODE, mode);
  }

  setSelectedVoice(voiceURI: string): void {
    this.selectedVoiceURI.set(voiceURI);
    localStorage.setItem(STORAGE_KEY_VOICE_URI, voiceURI);
  }

  previewVoice(voiceURI: string): void {
    if (!this.ttsSupported) return;
    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance('Hello! This is how I sound.');
    const voice = this.availableVoices().find(v => v.voiceURI === voiceURI);
    if (voice) utterance.voice = voice;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    speechSynthesis.speak(utterance);
  }

  // --- Private helpers ---

  private loadVoices(): void {
    const voices = speechSynthesis.getVoices();
    this.availableVoices.set(voices);

    // If no voice selected yet, pick the default
    if (!this.selectedVoiceURI() && voices.length > 0) {
      const defaultVoice = voices.find(v => v.default) || voices[0];
      this.selectedVoiceURI.set(defaultVoice.voiceURI);
    }
  }

  private loadTtsMode(): TtsMode {
    const stored = localStorage.getItem(STORAGE_KEY_TTS_MODE);
    if (stored === 'off' || stored === 'spoken-only' || stored === 'always') {
      return stored;
    }
    return 'spoken-only';
  }

  private loadVoiceURI(): string {
    return localStorage.getItem(STORAGE_KEY_VOICE_URI) || '';
  }
}
