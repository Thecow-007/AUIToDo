import { Injectable, signal } from '@angular/core';

export interface UserProfile {
  name: string;
  email: string;
  initials: string;
}

const STORAGE_KEY_PROFILE = 'auitodo_user_profile';

@Injectable({
  providedIn: 'root'
})
export class ProfileService {
  
  isModalOpen = signal(false);
  currentUser = signal<UserProfile>(this.loadProfile());

  constructor() {}

  openModal(): void {
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
  }

  updateProfile(name: string, email: string): void {
    const initials = this.calculateInitials(name);
    const profile: UserProfile = { name, email, initials };
    
    this.currentUser.set(profile);
    localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(profile));
  }

  private loadProfile(): UserProfile {
    const stored = localStorage.getItem(STORAGE_KEY_PROFILE);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.warn('Failed to parse stored profile');
      }
    }
    // Default profile
    return {
      name: 'Test User',
      email: 'test@example.com',
      initials: 'TU'
    };
  }

  private calculateInitials(name: string): string {
    if (!name || !name.trim()) return 'U';
    
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0].substring(0, 1).toUpperCase();
    }
    
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
}
