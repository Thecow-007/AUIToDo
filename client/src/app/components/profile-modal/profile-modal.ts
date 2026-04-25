import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProfileService } from '../../services/profile.service';

@Component({
  selector: 'app-profile-modal',
  imports: [FormsModule],
  templateUrl: './profile-modal.html',
  styleUrl: './profile-modal.css'
})
export class ProfileModal implements OnInit {
  @Output() close = new EventEmitter<void>();

  profileService = inject(ProfileService);

  editName = '';
  editEmail = '';

  ngOnInit(): void {
    const current = this.profileService.currentUser();
    this.editName = current.name;
    this.editEmail = current.email;
  }

  saveProfile(): void {
    if (this.editName.trim() && this.editEmail.trim()) {
      this.profileService.updateProfile(this.editName.trim(), this.editEmail.trim());
      this.closeModal();
    }
  }

  closeModal(): void {
    this.close.emit();
  }

  stopPropagation(event: Event): void {
    event.stopPropagation();
  }
}
