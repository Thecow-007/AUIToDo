import { Injectable, signal } from '@angular/core';

export type AppPage = 'list' | 'calendar' | 'priority' | 'tags';

@Injectable({ providedIn: 'root' })
export class PageService {
  readonly activePage = signal<AppPage>('list');

  setPage(page: AppPage) {
    this.activePage.set(page);
  }
}
