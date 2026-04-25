# AUIToDo — Frontend TODO

Tracks remaining work to bring the Angular client fully in line with `ProjectBreakdown.md`. Items completed on the `Daniel` branch are marked at the top for context.

## Already done on `Daniel`

- `Task` model rewritten to spec (`parentId`/`childIds`/`tagIds`, `dueAt: Date`, lowercase priority, dropped `estimatedDuration`/`energyLevel`)
- `TaskService` introduced (flat map + root IDs, completion cascade per spec §3, preview-state tracking, `allTags`)
- Task detail **modal** mounted at app root and reads the live task via `TaskModalService` + `TaskService` (modal stays in sync as the tree changes)
- Spec §4 amended: row is a single-line summary (no description); click opens the modal
- Tag chips render on each row; modal exposes a tag toggle list
- Preview-state border classes (`preview-create` / `preview-update` / `preview-delete`) added to `task-node.css`
- Sidebar nav rewritten: List / Calendar / Priority / Tags (Search dropped, Urgent renamed)
- Sidebar no longer renders page content inline
- App grid fixed so chatbar spans full bottom width
- Chatbar restructured: vertical, expand-upward chat history, search-trail rendering, mic button removed
- Header gained 🔔 bell + unread-count badge
- Root `npm start` now runs the Angular dev server (`npm run server` / `server:dev` for Express)

## 1. Routing (blocks most other work)

- [ ] Install `@angular/router` (already in deps but unused) and add `provideRouter` to `app.config.ts`.
- [ ] Add `<router-outlet>` inside `.pane-main` in `app.html` (chatbar must remain outside the outlet — spec §4).
- [ ] Define routes: `/list` (default), `/calendar`, `/priority`, `/tags`, `/notifications`, `/login`, `/register`.
- [ ] Wire `navigation-pane` buttons to `routerLink` + `routerLinkActive` (drop the `activeRoute` signal).
- [ ] Add `CanActivate` auth guard once auth lands (spec §8).

## 2. Filter bar component (`/list`, `/calendar`, `/priority`)

- [ ] Build `FilterBar` component: keyword input, multi-tag select, status (all/active/completed), due-date range.
- [ ] Hold filter state in a `FilterService` (or per-route signals) so it survives nav within filtered routes.
- [ ] Apply filter to `taskService` projections used by each page.
- [ ] Replace the `filter-bar-placeholder` div in `main-content-pane.html`.

## 3. Page components

- [ ] `/list` — already mostly there via `MainContentPane`; just needs the filter bar and "+ New Todo" buttons (root and per-row).
- [ ] `/calendar` — month grid with dots on days that have due todos; clicking a day sets the active filter; chronologically-sorted upcoming list below.
- [ ] `/priority` — four sections (Urgent → High → Medium → Low), each sorted by `dueAt` asc.
- [ ] `/tags` — tag CRUD; click tag → filter `/list` by that tag.
- [ ] `/notifications` — paginated list, filters for read/unread + type, click row navigates to the related todo.

## 4. AI chat pipeline (spec §5)

- [ ] `AiChatService` that POSTs to `/api/ai/chat` and consumes the SSE stream.
- [ ] Map events into chat state:
  - `trail_step` → append to active AI message's `trail`
  - `preview` → call `taskService.setPreview(todoId, action)`; clear after `applied`
  - `applied` → call `taskService.updateTask(...)` / `toggleComplete` / etc.
  - `final` → set message text and collapse the trail
  - `error` → render error state
- [ ] Hold ~300ms preview before applying (spec §4).
- [ ] Pass `currentView` (active route + filter) to the API on every send.

## 5. Backend integration

- [ ] HTTP client wiring: `provideHttpClient(withInterceptors(...))` with a session cookie credentials interceptor.
- [ ] `AuthService` (`POST /api/auth/{register,login,logout}`, `GET /api/auth/me`).
- [ ] `TaskService` swap demo seed for real API calls (`GET /api/todos`, `POST /api/todos`, `PATCH /api/todos/:id`, `DELETE /api/todos/:id`, `POST /api/todos/:id/complete`).
- [ ] `TagService` against `/api/tags`.
- [ ] `NotificationsService` polling `/api/notifications/unread-count` every 30s; full list against `/api/notifications`.

## 6. Auth UI

- [ ] `/login` and `/register` page components and forms.
- [ ] Top-bar `Log Out` button must hit `POST /api/auth/logout` and route to `/login`.

## 7. Styling / polish

- [ ] `task-node.css` is 263 bytes over the 4 kB component budget — either bump the budget in `angular.json` or extract the inline-detail-panel styles into a child component.
- [ ] Animate the preview-state borders into the `applied` mutation (spec calls for ~300ms hold then animate to final state).
- [ ] Decide on offscreen-preview behavior (spec §4: if affected row isn't visible, show preview only in the chat trail).

## 8. Stretch (per spec §10)

- [ ] Vector search in the locate phase (Atlas Vector Search).
- [ ] Recurring todos (`RecurrenceRule` model + cron rollover; UI to attach a rule to a todo).
- [ ] Reminders + notifications surfaces fully wired.
- [ ] Web Speech API in the chatbar (only after MVP — spec §2 explicitly says do not design for it yet).
- [ ] Server-Sent Events for live notification delivery.
