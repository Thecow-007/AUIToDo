# AUIToDo — Project Design Document

> **One-liner:** A nested todo manager where an AI chatbar is the primary way to create, find, and update tasks. Tasks live in an unlimited tree, the chatbar is persistent across every page, and AI actions visually mutate the UI in real time.

This document is the source of truth for AUIToDo's design. It is intentionally written so that an AI tool dropping into this project cold can implement features without re-deriving the basics. If something here contradicts the code, fix whichever is wrong — but do not let the code and the doc drift silently.

---

## 1. Project Overview

AUIToDo is a hackathon project being built by team **MEAN Programmers** on the MEAN stack (MongoDB, Express, Angular, Node.js). It started 2026-04-25.

The product is a todo manager with three distinguishing characteristics:

1. **Unlimited nested tasks.** Todos have parent/child relationships; a project like "Assignment 2" can have any number of subtasks ("write intro", "write p1", "write conclusion"), each of which can itself have children. Children are referenced by ID arrays on parents.
2. **AI as a primary interaction surface.** A persistent chatbar at the bottom of every page lets the user create, find, update, complete, or delete todos in natural language. The AI uses a two-phase tool-calling pipeline (locate, then act) and runs on Cerebras for low-latency inference.
3. **Live UI feedback.** When the AI is about to mutate a todo, the corresponding row in the main view enters a "preview" state (colored border indicating the pending action), then animates into its updated state. Inspired by the AUI Spreadsheet preview-on-type pattern, adapted for chat-driven actions.

Manual UI controls (clicking, typing, dragging) are first-class — every feature accessible via the AI is also accessible without it. The AI is a productivity layer, not a gatekeeper.

---

## 2. Tech Stack

| Layer        | Choice                                    | Notes |
|--------------|-------------------------------------------|-------|
| Frontend     | Angular                                   | Chosen so "MEAN Programmers" team name is accurate. Team is new to Angular. |
| Backend      | Node.js + Express                         | |
| Database     | MongoDB (Atlas)                           | Atlas required for native vector search. |
| AI Inference | Cerebras Cloud API                        | Currently leaning **GPT OSS 120B** — Llama-family models considered too small for multi-step tool calling, Qwen too large/expensive. Confirm at integration time. |
| Embeddings   | TBD (e.g. OpenAI `text-embedding-3-small`) | Generated on todo create/update for vector search. |
| Auth         | Passport.js (`passport-local`) + `express-session` | Familiar to team; sessions stored in Mongo via `connect-mongo`. |
| Deployment   | Docker + Docker Compose                   | Linux server target, Windows dev. |

### Voice-to-text (future / stretch — not MVP)
Approach TBD. Likely Web Speech API in the browser for STT (one line of JS, no backend cost) and TTS for AI responses. The chatbar UI reserves space for a microphone toggle. The team is researching this — do not design for it yet.

---

## 3. Data Models

### `User`
- `_id`
- `email`, `passwordHash` (bcrypt)
- `displayName`
- `createdAt`

### `Todo`
- `_id`
- `userId` — owner
- `parentId: ObjectId | null` — null for root tasks
- `childIds: ObjectId[]` — direct children only (one level)
- `title: string` — required
- `description: string` — optional, free-form
- `priority: 'low' | 'medium' | 'high' | 'urgent'`
- `dueAt: Date | null` — date AND time (timezone-aware)
- `isCompleted: boolean`
- `completedAt: Date | null`
- `tagIds: ObjectId[]`
- `recurrenceRuleId: ObjectId | null`
- `embedding: number[]` — vector for semantic search; populated on create/update
- `createdAt`, `updatedAt`

#### Completion cascade behavior
- **Checking a parent complete → cascades the check to ALL descendants** (recursive).
- **Unchecking a parent does NOT uncheck descendants.** They keep whatever state they had.

This asymmetry is intentional: completing a project should imply all sub-work is done; reopening the project shouldn't undo independent decisions about subtasks.

#### Indexes
- `{ userId: 1, parentId: 1 }` — fast tree fetches
- `{ userId: 1, isCompleted: 1, dueAt: 1 }` — calendar / upcoming queries
- `{ userId: 1, priority: 1 }` — priority view
- Vector index on `embedding` — Atlas Vector Search

### `Tag`
- `_id`
- `userId`
- `label: string`
- `color: string` (hex)
- `createdAt`

The AI is given the user's full tag list in its system prompt and is **explicitly instructed not to apply tags unless the user has indicated something that should be tagged**. Default behavior is no-tag.

### `Notification`
- `_id`
- `userId`
- `type: 'reminder' | 'recurrence' | 'system'`
- `todoId: ObjectId | null`
- `triggerAt: Date` — when this notification became active
- `body: string`
- `read: boolean`
- `createdAt`

### `RecurrenceRule`
- `_id`
- `userId`
- `todoId` — owner todo (one rule per todo)
- `frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'`
- `interval: number` — every N units (e.g. every 2 weeks)
- `dayOfWeek?: number[]` — for weekly
- `dayOfMonth?: number` — for monthly
- `nextTriggerAt: Date`

#### Recurrence behavior
When `nextTriggerAt <= now`:
1. Set `todo.isCompleted = false`, `todo.completedAt = null`.
2. Advance `todo.dueAt` to the next occurrence.
3. Advance `recurrenceRule.nextTriggerAt` by one interval.
4. Descendants are NOT auto-uncompleted (consistent with the manual uncheck rule).
5. A `Notification` of type `recurrence` is created.

This is simpler than spawning new todo instances: the same todo row resets and reappears in active views, preserving its history and identity.

A `node-cron` job runs every minute to find rules where `nextTriggerAt <= now` and apply the rollover.

---

## 4. UI Layout

### Global shell

The Angular app has a single top-level layout in `app.component.html`:

```
┌─────────────────────────────────────────────────────────┐
│ Top Bar: app name | 🔔 bell (unread count) | user menu  │
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│ Sidebar  │              Main Content                    │
│  (nav)   │           (Angular <router-outlet>)          │
│          │                                              │
│ ⊕ List   │                                              │
│ 📅 Cal   │                                              │
│ ⚡ Prio  │                                              │
│ 🏷 Tags  │                                              │
│          │                                              │
├──────────┴──────────────────────────────────────────────┤
│ AI Chatbar (persistent, expands upward when active)     │
└─────────────────────────────────────────────────────────┘
```

The chatbar lives **outside** `<router-outlet>` so it survives navigation — chat state, history, and pending operations are preserved across route changes. This is one of the main reasons Angular is worth using here vs. vanilla.

### Routes / Pages

#### `/list` (default landing)
- **Filter bar at the top** of the page: keyword, tag(s), status, due-date range. (No separate search route — search is a filter, applied per-page.)
- Below: the global todo tree. Each row shows checkbox, title, priority badge, due date, tag chips. Click a row to expand its children inline; click again to collapse.
- "+ New Todo" button at root level and inside each row (to create children).
- Clicking the title opens an inline detail panel on the same row (description, edit, delete) — no modal, no route change.

#### `/calendar`
- The same filter bar at the top.
- A month-grid calendar with dots on dates that have due todos. Clicking a date filters the list below to that day.
- Below the calendar: a chronologically-sorted list of upcoming todos (respecting the active filter).

#### `/priority`
- The same filter bar at the top.
- Todos grouped into sections: Urgent → High → Medium → Low. Within each group, sorted by due date ascending.

#### `/tags`
- Tag CRUD. Click a tag to see all todos using it.

#### `/notifications`
- Full paginated list. Filters: read/unread, type. Click an item to navigate to the related todo.

### AI chatbar component

- Single-line input by default; expands upward into a scrollable chat history when clicked or when there are messages to display.
- Each AI turn renders a **search trail** — a thin, Claude-Code-style stream of step labels as the AI calls tools (e.g. *"Searching top-level tasks…"*, *"Opening 'Assignment 2'…"*, *"Marking 'write conclusion' done"*). The trail collapses to a single line after the action completes, leaving the final natural-language confirmation as the visible message.

### Live UI feedback (preview-then-apply)

When the AI's locate phase identifies a target todo, the corresponding row in the main view enters a **preview state** with a colored border indicating the pending action:

- 🔴 red — pending delete
- 🟢 green — pending create
- 🟡 yellow — pending update / tag change / completion toggle

The preview holds for ~300ms so the user can see what's about to change, then the action commits and the row animates to its final state. There is **no explicit confirmation click** — the AI commits automatically. This is inspired by AUI Spreadsheet's "highlight on type, apply on enter" pattern, adapted to chat-driven actions where the chat submission is the equivalent of pressing enter.

If the affected row is not currently visible (e.g. user is on `/calendar` but the AI is editing a non-due todo), the preview is shown only in the chatbar's search trail — no offscreen animation.

---

## 5. AI Architecture

### Why two phases?

The user may have thousands of todos in a deeply nested tree. Sending the entire tree to the LLM every prompt is wasteful: slow, expensive, and lossy at the leaves. Instead, the AI runs a **locate phase** that uses tools to narrow down to a target todo, then an **act phase** that performs the operation. Each phase is its own Cerebras call with tightly-scoped context.

Expected end-to-end latency: ~2–4 seconds per user message in the common case. The search trail in the UI gives the user feedback during this window, turning latency into transparency.

### Phase 1 — Locate

**System prompt includes:**
- All root-level todos as `{id, title, tagIds}` (titles only — cheap)
- All available tags as `{id, label}`
- The current view context (which page the user is on, any active filter)
- Tool definitions for the locate phase
- The "do not apply tags unless the user indicated it" rule

**Tools:**

| Tool | Parameters | Returns |
|------|------------|---------|
| `vector_search` | `query: string`, `k?: number` (default 10) | Top-K todos by semantic similarity, each with `{id, title, breadcrumb, tagIds}` |
| `expand_todo` | `id: ObjectId` | One level of children: `[{id, title, tagIds, isCompleted}]` |
| `confirm_target` | `id: ObjectId` | Ends Phase 1 with the located todo |
| `respond_no_target` | `reason: string` | Ends Phase 1 if the user wants a fresh todo created (no existing target) |

**Loop behavior:** the AI tries `vector_search` first (broad, cheap, returns breadcrumbs so hierarchy is visible), then `expand_todo` to drill down where ambiguity remains. It must end Phase 1 with `confirm_target` or `respond_no_target` — no free-form output. Ambiguity is a reason to expand further, not to guess.

### Phase 2 — Act

**System prompt includes:**
- The located target todo (full record) OR an indication of "no target — create new"
- The user's original message
- The list of available tags (so tag operations are id-correct)
- Action tool definitions

**Tools:**

| Tool | Action |
|------|--------|
| `create_todo` | Insert a new todo, optionally as a child of `parentId` |
| `update_todo` | Modify fields (title, description, dueAt, priority) |
| `complete_todo` | Toggle `isCompleted` (with cascade per the rule above) |
| `delete_todo` | Delete a todo and its descendants |
| `add_tag_to_todo` / `remove_tag_from_todo` | Tag operations |
| `create_recurrence` | Attach a `RecurrenceRule` to a todo |

The AI calls **exactly one** action tool, then produces a short natural-language confirmation to display in chat.

### Embedding pipeline

When a todo is created or its `title`/`description` is updated, an embedding is generated and stored on `todo.embedding`. To keep the request path snappy, embedding generation is queued (fire-and-forget after DB write) — the todo is searchable by vector within ~1 second. `vector_search` falls back to text search if the embedding is missing.

### Streaming to the frontend

The frontend sends the user message to `POST /api/ai/chat` and receives a Server-Sent Events stream. Events:

- `trail_step` — `{label, toolName, args}` for each AI tool call (drives the search trail UI)
- `preview` — `{todoId, action}` so the main view can flash the preview state
- `applied` — `{todoId, mutation}` so the main view can animate to the new state
- `final` — `{message}` final natural-language reply
- `error` — `{message}`

---

## 6. Recurring Todos

See `RecurrenceRule` model above. Behavior recap:
- A recurring todo "completes" normally when checked.
- When `nextTriggerAt` arrives, a `node-cron` job un-completes the todo, advances its `dueAt`, and creates a `recurrence` notification.
- Children are NOT auto-uncompleted.

Stretch feature — implement after the core AI loop works.

---

## 7. Notifications & Reminders

### Sources
- **Reminder:** user attached a reminder offset to a todo (e.g. "1 hour before due"). A `node-cron` job runs every minute, finds todos whose `dueAt - reminderOffset <= now` and which haven't fired their reminder yet, then inserts `Notification` rows.
- **Recurrence:** see Section 6.
- **System:** miscellaneous app messages.

### Surfaces
- 🔔 bell in the top bar shows unread count; clicking opens a dropdown of the most recent 5 notifications.
- `/notifications` route is the full management page (paginated list + filters).

### Delivery
In-app only for the hackathon. Frontend polls `GET /api/notifications/unread-count` every 30 seconds, or upgrades to Server-Sent Events if time permits. No email or browser push notifications.

---

## 8. Authentication

- **Library:** Passport.js with `passport-local`.
- **Sessions:** `express-session` backed by MongoDB via `connect-mongo`.
- **Routes:** `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
- **Frontend:** Angular `CanActivate` guard on every route except `/login` and `/register`.
- **Passwords:** bcrypt with a sensible cost factor (10 is fine for the hackathon).

All non-auth API routes require a valid session and scope queries by `req.user._id`.

---

## 9. API Surface (preliminary sketch)

REST under `/api`. Subject to change as implementation reveals constraints.

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/todos                  # query: parentId, tag, status, dueFrom, dueTo, q
GET    /api/todos/:id
GET    /api/todos/:id/children
POST   /api/todos
PATCH  /api/todos/:id
DELETE /api/todos/:id
POST   /api/todos/:id/complete     # handles cascade

GET    /api/tags
POST   /api/tags
DELETE /api/tags/:id

GET    /api/notifications          # query: unread, type, page
GET    /api/notifications/unread-count
PATCH  /api/notifications/:id/read

POST   /api/ai/chat                # body: { message, conversationId?, currentView }
                                   # response: SSE stream — see "Streaming to the frontend"
```

---

## 10. Feature Priority

### MVP (must-have for demo)
- User auth (register, login, logout)
- Todo CRUD via UI (create, edit, complete, delete, nest with cascade)
- Tags (create, assign via UI)
- AI chatbar with two-phase pipeline (locate + act), using `expand_todo` only initially
- Search/filter bar on `/list`
- Calendar view (month grid + upcoming list, with filter bar)
- Priority view (with filter bar)
- Live preview-then-apply UI feedback
- Search trail in chat

### Stretch (if time permits)
- Vector search in the locate phase
- Recurring todos
- Notifications + reminders
- Voice-to-text in the chatbar (Web Speech API)
- Server-Sent Events for live notification delivery

---

## 11. Glossary

- **AUI** — informal mashup of "AI" and "UI". Not a formal acronym; reused across the team's projects (also AUI Spreadsheet) to brand AI-driven interfaces.
- **Locate phase** — first AI call, narrows down which todo the user is referring to.
- **Act phase** — second AI call, performs the operation on the located todo.
- **Search trail** — the in-chat stream of tool-call labels showing the AI's reasoning steps as they happen.
- **Preview state** — the colored-border UI state on a todo row before the AI's action commits.
- **Cascade (completion)** — checking a parent complete recursively checks all descendants. Unchecking does not cascade.
