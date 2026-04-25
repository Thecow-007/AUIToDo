# AUIToDo — Frontend / Integration TODO

Tracks remaining work after the **`integration` branch** merge of Daniel's backend with Michael's frontend (2026-04-25). The big plumbing is done; what remains is feature work, polish, and the deferred stretch goals.

---

## Already shipped on `integration`

### Backend (from Daniel)
- Models: `User`, `Todo`, `Tag`. `Notification` and `RecurrenceRule` deferred (stretch).
- Auth: passport-local + bcrypt + Mongo-backed sessions. `/api/auth/{register,login,logout,me}`.
- Todo CRUD + tag CRUD with `userId` scoping on every query.
- `POST /api/todos/:id/complete` cascades on check, asymmetric on uncheck, returns `affected[]` for undo.
- `DELETE /api/todos/:id` returns full subtree snapshot; `POST /api/todos/restore` rehydrates original `_id`s.
- `PATCH /api/todos/:id` returns `{before, after}` of changed fields (drives undo).
- **`PATCH /api/todos/:id` now supports `parentId`** — used for drag-drop reparenting. Server walks the new parent's chain and rejects cycles (`parent_circular`, `parent_self`, `parent_not_found`); maintains `childIds` on both old and new parent atomically.
- AI pipeline (two-phase): `/api/ai/chat` SSE stream. Events: `trail_step`, `preview`, `applied`, `final`, `error`. Atlas vector search with $text fallback. Embedding generation fire-and-forget on todo create/update.
- Tests: `npm test` (17 API tests, mongodb-memory-server, ~3s, no API cost) + `npm run test:ai` (2 smoke tests, hits Cerebras + OpenAI).

### Frontend (from Michael, integrated and rewired)
- Glass-panel layout, header, navigation tabs (All/Calendar/Urgent/Search), main pane with task tree, resizable AI chat panel docked at the bottom.
- **Drag-and-drop reparenting** with client-side circular-ref guard (`DragDropService`); now PATCHes `/api/todos/:id` instead of mutating local state.
- Markdown descriptions (`marked` + `MarkdownPipe`) with edit/preview toggle in the task modal.
- **Speech (STT + TTS)** via Web Speech API: hold-to-talk mic, transcript overlay, voice-settings modal, TTS speak/stop bar. Pure frontend, no backend impact.
- `ChangeType` + `FieldChange[]` per task for AI diff highlighting (yellow row + old-value strikethrough on changed fields).
- Task detail modal mounted at app root, kept in sync via `TaskService` + `TaskModalService`.
- Header-bar: 🔔 bell + unread-count badge, ✨ chat-toggle, **Log Out wired to `AuthService.logout()`**.

### Glue work done in the merge
- `Task` model unified — backend shape wins (`parentId`/`childIds`, lowercase priority, `Date dueAt`, `tagIds`). Dropped `estimatedDuration`/`energyLevel` per scope decision. `changeType`/`fieldChanges` kept as optional client-only annotations.
- `provideHttpClient` wired in `app.config.ts` with a credentials interceptor (session cookie rides every request). Angular dev proxy at `client/proxy.conf.json` forwards `/api/*` → `localhost:7040`.
- `TaskService` rewritten as the HTTP-backed cache: signal-driven `tasksById`/`rootTaskIds`/`tagsById`/`previewByTaskId`, methods `refresh(filters)`/`createTask`/`updateTask`/`toggleComplete`/`deleteTask`, with completion cascade applied locally on `affected[]`.
- `AuthService` + `AiChatService` (SSE stream parser using fetch + AbortController, routes `preview`/`applied` events into `TaskService`).
- `LoginScreen` overlay (email + password, register auto-derives `displayName` from email). Shown when `auth.currentUser()` is null.
- **Filters button** on the main pane: priority multi-select + due-date preset (Today / This week / Overdue / Any). Calls `/api/todos` with query params.
- Deleted: `server/controllers/helloController.js`, `server/routes/helloRoutes.js`, `documentation/BackendIntegrationGuide.md`.

---

## 1. Calendar view

- [ ] `/calendar` route (or a Calendar tab body with real content; Michael's current tab body is a placeholder).
- [ ] Month grid: days with at least one due todo get a dot. Click a day → active filter narrows the list to that day.
- [ ] Below the grid: chronological list of upcoming todos (respect active filter from the main pane).

## 2. Routing (lower priority — single-page nav works fine for now)

The app currently uses sidebar tab signals, not routes. Real routing is only needed if we want deep-linking, browser back/forward, or `CanActivate` guards.

- [ ] If we want it: install `@angular/router`, add `provideRouter` to `app.config.ts`, `<router-outlet>` inside `.pane-main`. Routes: `/list`, `/calendar`, `/notifications`, `/login`, `/register`. Wire nav tabs to `routerLink` + `routerLinkActive`.
- [ ] `CanActivate` guard that redirects to `/login` if `auth.currentUser()` is null. (Currently the LoginScreen overlay handles this without routing.)

## 3. Filter bar polish

- [x] Filters button + priority + due-date presets on main pane.
- [ ] Keyword search filter (the backend already supports `?q=` via Mongo `$text`).
- [ ] Tag multi-select filter chip row.
- [ ] Active filter pills under the button so the user sees what's applied without re-opening the panel.
- [ ] Persist filter state across nav-tab changes.

## 4. AI chat — wire the still-pending bits

- [x] `AiChatService` + SSE consumption (trail_step, preview, applied, final, error).
- [x] `preview` → `taskService.setPreview(...)`; `applied` → preview cleared + `taskService.refresh()`.
- [ ] **Surgical `applied` handling** — current impl just calls `taskService.refresh()` after every `applied`. Cleaner: deserialize the `todo` payload directly into the cache, only refresh on cascade-affecting mutations (delete, bulk).
- [ ] **Ghost preview while typing** (spec §4 + §5 ghost-preview pipeline). Backend endpoint `POST /api/ai/ghost-preview` (locate-only, no act). Frontend debounces input ~400ms, min ~8 chars, AbortController on input change.
- [ ] Pass `currentView` (active tab + active filter) to the chat API on every send. Currently hardcoded to `'list'`.
- [ ] `Ctrl+Z` undo handler + post-action toast (spec §11). Stack lives on a session-only service. Inverses driven by the response shapes already returned (`{before,after}`, cascade `affected[]`, delete subtree snapshot).

## 5. Auth UI polish

- [x] `LoginScreen` overlay with login + register modes; auto-derives `displayName`.
- [ ] Optional explicit `displayName` field in the register form.
- [ ] Better error messages — currently surfaces raw `error` strings (`invalid_email`, `email_taken`, etc.).
- [ ] "Forgot password" — out of scope for hackathon, but worth flagging.

## 6. Bug fixes / known issues

- [ ] AI chat box: long histories don't auto-scroll to the bottom. Add `@ViewChild` + `scrollIntoView` on new message.
- [ ] AI chat box `final` event: TTS speaks the AI's literal text including any markdown (e.g. asterisks read as "asterisk"). Strip markdown before passing to `speechService.speak()`.
- [ ] Drag-drop: `endDrag()` on `dragend` fires AFTER `drop`'s success path, which is fine — but if drop is invalid the dragged ghost stays styled. Verify and clean up.
- [ ] Filters panel doesn't close on outside click. Either click-away listener, or move it into a popover overlay.
- [ ] After register, the LoginScreen briefly flashes off-and-on while `tasks.refresh()` resolves. Show a "loading" state during initial fetch.

## 7. Styling / polish

- [ ] `task-node.css` may exceed the 4 KB component budget — bump it in `angular.json` if Angular complains, or extract the inline-detail-panel styles into a child component.
- [ ] Animate the AI preview borders into the `applied` mutation (~300ms hold then animate to final state).
- [ ] Decide on offscreen-preview behavior (spec §4: if affected row isn't visible, show preview only in the chat trail).
- [ ] Calendar tab placeholder shows `[Mini Calendar Widget]` — replace once the calendar view lands.

## 8. Stretch (per spec §10)

- [x] Web Speech API STT/TTS in the chatbar (already shipped).
- [ ] **Vector search guarantees**: index needs to be created in Atlas UI (see `ProjectBreakdown.md` §5). Until done, locate falls back to `$text` — correct but degraded.
- [ ] **Recurring todos** (`RecurrenceRule` model + `node-cron` rollover; UI to attach a rule). Spec §6.
- [ ] **Reminders + notifications** (`Notification` model, `/api/notifications/*`, reminder cron, in-app bell dropdown wiring). Spec §7. Bell currently hardcoded to 0.
- [ ] Server-Sent Events for live notification delivery (replaces 30s polling).

## 9. Recommended next-session order

1. Calendar view — biggest visible-feature gap.
2. Bug-fix sweep (section 6) — small wins, improves perceived quality before demo.
3. Undo (Ctrl+Z + toast) — spec §11, response shapes already support it.
4. Ghost-preview-on-type — the "wow" interaction the spec built around.
5. Notifications + recurrence — only if time after MVP polish.
