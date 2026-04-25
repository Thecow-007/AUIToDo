import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, NgClass, UpperCasePipe } from '@angular/common';
import { TaskService } from '../../services/task.service';
import { TaskModalService } from '../../services/task-modal.service';
import { Task } from '../../models/task.model';

interface CalendarCell {
  date: Date;
  iso: string;
  inMonth: boolean;
  isToday: boolean;
  dueCount: number;
}

@Component({
  selector: 'app-calendar-page',
  imports: [DatePipe, NgClass, UpperCasePipe],
  templateUrl: './calendar-page.html',
  styleUrl: './calendar-page.css',
})
export class CalendarPage {
  readonly taskService = inject(TaskService);
  private readonly modal = inject(TaskModalService);

  private readonly today = new Date();
  readonly viewMonth = signal<{ year: number; month: number }>({
    year: this.today.getFullYear(),
    month: this.today.getMonth(),
  });
  readonly selectedIso = signal<string | null>(null);

  readonly weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Index tasks by their dueAt local-date ISO (YYYY-MM-DD).
  private readonly tasksByDay = computed(() => {
    const map = new Map<string, Task[]>();
    for (const task of this.taskService.allTasks()) {
      if (!task.dueAt) continue;
      const iso = toLocalIso(task.dueAt);
      const arr = map.get(iso);
      if (arr) arr.push(task);
      else map.set(iso, [task]);
    }
    return map;
  });

  readonly monthLabel = computed(() => {
    const { year, month } = this.viewMonth();
    return new Date(year, month, 1).toLocaleString(undefined, {
      month: 'long',
      year: 'numeric',
    });
  });

  readonly cells = computed<CalendarCell[]>(() => {
    const { year, month } = this.viewMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startOffset = firstOfMonth.getDay(); // 0 = Sunday
    const gridStart = new Date(year, month, 1 - startOffset);
    const todayIso = toLocalIso(this.today);
    const byDay = this.tasksByDay();

    const out: CalendarCell[] = [];
    for (let i = 0; i < 42; i++) {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + i);
      const iso = toLocalIso(date);
      out.push({
        date,
        iso,
        inMonth: date.getMonth() === month,
        isToday: iso === todayIso,
        dueCount: byDay.get(iso)?.length ?? 0,
      });
    }
    return out;
  });

  // Upcoming list: when a day is selected, show that day's tasks; otherwise
  // future-or-today tasks sorted ascending by dueAt (spec §4 — chronological
  // upcoming, respecting the active filter; here the active filter is the
  // selected date).
  readonly listedTasks = computed<Task[]>(() => {
    const sel = this.selectedIso();
    const all = this.taskService.allTasks().filter((t) => t.dueAt);
    if (sel) {
      return (this.tasksByDay().get(sel) ?? []).slice().sort(byDueAsc);
    }
    const startOfToday = new Date(this.today);
    startOfToday.setHours(0, 0, 0, 0);
    return all
      .filter((t) => t.dueAt && t.dueAt.getTime() >= startOfToday.getTime())
      .sort(byDueAsc);
  });

  readonly listHeading = computed(() => {
    const sel = this.selectedIso();
    if (!sel) return 'Upcoming';
    const [y, m, d] = sel.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  });

  prevMonth() {
    this.viewMonth.update(({ year, month }) =>
      month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 },
    );
  }

  nextMonth() {
    this.viewMonth.update(({ year, month }) =>
      month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 },
    );
  }

  goToToday() {
    this.viewMonth.set({
      year: this.today.getFullYear(),
      month: this.today.getMonth(),
    });
    this.selectedIso.set(toLocalIso(this.today));
  }

  selectDay(cell: CalendarCell) {
    if (this.selectedIso() === cell.iso) {
      this.selectedIso.set(null);
      return;
    }
    this.selectedIso.set(cell.iso);
    if (!cell.inMonth) {
      this.viewMonth.set({
        year: cell.date.getFullYear(),
        month: cell.date.getMonth(),
      });
    }
  }

  clearSelection() {
    this.selectedIso.set(null);
  }

  // Up to 3 dots; the "+N" indicator handles overflow.
  visibleDotCount(cell: CalendarCell): number[] {
    const n = Math.min(cell.dueCount, 3);
    return Array.from({ length: n }, (_, i) => i);
  }

  openTask(task: Task) {
    this.modal.open(task.id);
  }

  toggleComplete(task: Task, event: Event) {
    event.stopPropagation();
    this.taskService.toggleComplete(task.id).subscribe();
  }

  tagsFor(task: Task) {
    return this.taskService.getTagsFor(task);
  }
}

function toLocalIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function byDueAsc(a: Task, b: Task): number {
  return (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0);
}
