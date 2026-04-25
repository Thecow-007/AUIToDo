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
  readonly modalIso = signal<string | null>(null);

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

  // Upcoming list: tasks due in the next 5 days (today + 4), sorted ascending.
  readonly upcomingTasks = computed<Task[]>(() => {
    const startOfToday = new Date(this.today);
    startOfToday.setHours(0, 0, 0, 0);
    const end = new Date(startOfToday);
    end.setDate(end.getDate() + 5);

    return this.taskService
      .allTasks()
      .filter(
        (t) =>
          t.dueAt &&
          t.dueAt.getTime() >= startOfToday.getTime() &&
          t.dueAt.getTime() < end.getTime(),
      )
      .sort(byDueAsc);
  });

  readonly modalTasks = computed<Task[]>(() => {
    const iso = this.modalIso();
    if (!iso) return [];
    return (this.tasksByDay().get(iso) ?? []).slice().sort(byDueAsc);
  });

  readonly modalHeading = computed(() => {
    const iso = this.modalIso();
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
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
  }

  selectDay(cell: CalendarCell) {
    if (!cell.inMonth) {
      this.viewMonth.set({
        year: cell.date.getFullYear(),
        month: cell.date.getMonth(),
      });
    }
    this.modalIso.set(cell.iso);
  }

  closeDayModal() {
    this.modalIso.set(null);
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
