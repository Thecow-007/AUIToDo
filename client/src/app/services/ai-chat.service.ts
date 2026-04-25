import { Injectable, NgZone, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { TaskService } from './task.service';
import { ChangeType, FieldChange, PreviewAction, Task } from '../models/task.model';

export type AiChatEvent =
  | { type: 'trail_step'; label: string; toolName?: string; args?: unknown }
  | { type: 'preview'; todoId: string; action: PreviewAction; fieldChanges?: FieldChange[]; changeType?: ChangeType }
  | { type: 'applied'; mutation?: string; todoIds?: string[]; before?: Partial<Task>; after?: Partial<Task>; todo?: Task | null; [k: string]: unknown }
  | { type: 'final'; message: string }
  | { type: 'error'; message: string };

interface ChatHistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

@Injectable({ providedIn: 'root' })
export class AiChatService {
  private taskService = inject(TaskService);
  private zone = inject(NgZone);

  send(message: string, history: ChatHistoryEntry[]): Observable<AiChatEvent> {
    return new Observable<AiChatEvent>((subscriber) => {
      const controller = new AbortController();
      const previewedIds = new Set<string>();

      fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify({ message, history, currentView: 'list' }),
      })
        .then(async (resp) => {
          if (!resp.ok || !resp.body) {
            this.zone.run(() => {
              subscriber.next({ type: 'error', message: `chat_${resp.status}` });
              subscriber.complete();
            });
            return;
          }
          const reader = resp.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            // SSE messages separated by blank lines
            let idx;
            while ((idx = buffer.indexOf('\n\n')) >= 0) {
              const raw = buffer.slice(0, idx);
              buffer = buffer.slice(idx + 2);
              const event = parseSseEvent(raw);
              if (!event) continue;
              this.zone.run(() => {
                this.applyClientSideEffects(event, previewedIds);
                subscriber.next(event);
              });
            }
          }

          this.zone.run(() => {
            for (const id of previewedIds) this.taskService.setPreview(id, null);
            subscriber.complete();
          });
        })
        .catch((err) => {
          if (controller.signal.aborted) {
            subscriber.complete();
            return;
          }
          this.zone.run(() => {
            subscriber.next({ type: 'error', message: err?.message ?? 'network_error' });
            subscriber.complete();
          });
        });

      return () => {
        controller.abort();
        for (const id of previewedIds) this.taskService.setPreview(id, null);
      };
    });
  }

  private applyClientSideEffects(event: AiChatEvent, previewedIds: Set<string>) {
    if (event.type === 'preview') {
      previewedIds.add(event.todoId);
      this.taskService.setPreview(event.todoId, event.action);
      // Decorate the cached task with fieldChanges so the diff highlight renders.
      const cur = this.taskService.getTask(event.todoId);
      if (cur && (event.fieldChanges || event.changeType)) {
        this.taskService.upsertTask({
          ...cur,
          fieldChanges: event.fieldChanges,
          changeType: event.changeType,
        });
      }
    } else if (event.type === 'applied') {
      // Server has applied the mutation — pull a fresh tree so cache mirrors DB,
      // then clear the per-row preview annotation on every affected row.
      this.taskService.refresh().subscribe();
      const ids = Array.isArray(event.todoIds)
        ? event.todoIds.filter((x): x is string => typeof x === 'string')
        : [];
      for (const id of ids) {
        this.taskService.setPreview(id, null);
        previewedIds.delete(id);
      }
    }
  }
}

function parseSseEvent(raw: string): AiChatEvent | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  }
  if (!dataLines.length) return null;
  try {
    const data = JSON.parse(dataLines.join('\n'));
    return { type: event, ...data } as AiChatEvent;
  } catch {
    return null;
  }
}
