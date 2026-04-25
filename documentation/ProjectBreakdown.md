# AUIToDo — Project Design Document

> **One-liner:** A nested todo manager where an AI chatbar is the primary way to create, find, and update tasks. Tasks live in an unlimited tree, the chatbar is persistent across every page, and AI actions visually mutate the UI in real time.

This document is the source of truth for AUIToDo's design. It is intentionally written so that an AI tool dropping into this project cold can implement features without re-deriving the basics. If something here contradicts the code, fix whichever is wrong — but do not let the code and the doc drift silently.

---

## 1. Project Overview

AUIToDo is a hackathon project being built by team **MEAN Programmers** on the MEAN stack (MongoDB, Express, Angular, Node.js). It started 2026-04-25.

The product is a todo manager with three distinguishing characteristics:

1. **Unlimited nested tasks.** Todos have parent/child relationships; a project like "Assignment 2" can have any number of subtasks ("write intro", "write p1", "write conclusion"), each of which can itself have children. Children are referenced by ID arrays on parents.
2. **AI as a primary interaction surface.** A persistent chatbar at the bottom of every page lets the user create, find, update, complete, or delete todos in natural language. The AI uses a two-phase tool-calling pipeline (locate, then act) and runs on Cerebras for low-latency inference.
3. **Ghost previews while typing.** As the user types into the chatbar, the AI runs its locate phase against the partial input and the affected rows highlight in real time (red = predicted delete, yellow = update/complete/tag, green = create). Backspacing rolls the preview back; pressing Enter commits and the rows animate to their final state. Inspired by the AUI Spreadsheet preview-on-type pattern, adapted faithfully for chat where typing is typing and Enter is the commit.

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
- **Empty-state onboarding.** First-time users (no todos yet) see a hero that highlights the chatbar with 3–4 click-to-fire example prompts (e.g. *"Add Assignment 2 due Friday with subtasks intro, body, conclusion"*) and a "+ New Todo" button for manual creation. Once any todo exists, the empty state is replaced by the tree.
- **Filter bar at the top** of the page: keyword, tag(s), status, due-date range. (No separate search route — search is a filter, applied per-page.)
- Below: the global todo tree. Each row is a **single-line summary**: checkbox, title, priority badge, due date, tag chips. Description is **not** shown on the row.
- A chevron on rows that have children expands them inline; click the chevron again to collapse.
- "+ New Todo" button at root level and inside each row (to create children).
- **Drag-and-drop reordering and reparenting.** Dragging a row onto another row reparents it as a child; dragging up/down within a parent reorders siblings. Sibling order is the parent's `childIds` array order — mutating that array is the persistence model. A `PATCH /api/todos/:id/move` endpoint atomically updates the moved todo's `parentId` and the old/new parent's `childIds`. Drop targets show a visual hint (insertion line for sibling-reorder, highlight for child-drop). Move actions are undoable.
- Clicking anywhere else on the row opens a **task detail modal** with the full record (description, status, priority, due date, tags) for editing. The modal is mounted at the app root and stays in sync with the tree via `TaskService`.
- **Markdown in descriptions.** The description field is markdown — rendered for display in the modal, plain textarea for editing with a Preview tab. Render with a small allowlist (headings, lists, links, code, bold/italic) — no raw HTML passthrough.

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

### Ghost preview & live UI feedback

The headline interaction: **as the user types in the chatbar, the AI runs the locate phase against the partial input and the affected rows highlight in real time**. No mutation happens until the user presses Enter. Backspacing or rephrasing rolls the highlights back. This replaces a pre-commit confirmation pause — by the time the user presses Enter, they have already seen what's about to happen, and undo is the safety net for anything that slips through.

- 🔴 red border — predicted delete
- 🟢 green border — predicted create. Shown as a phantom dashed-border row at the insertion point if the parent is visible; otherwise indicated only in the search trail.
- 🟡 yellow border — predicted update / tag change / completion toggle

#### Ghost preview behavior
- The chatbar **debounces** input by ~400ms after the last keystroke and only fires a ghost-preview request once the input is at least ~8 characters. This prevents per-keystroke spam.
- Each ghost-preview request runs **locate-only** — no act phase, no DB writes. The locate phase ends with `confirm_targets({ ids, intent })` or `respond_no_target`. `intent` ∈ `{ delete | update | complete | tag | create_child | recurrence }` and drives the highlight color.
- Any in-flight ghost-preview request is **cancelled** (`AbortController`) when the input changes, so previews don't apply out of order with respect to user input.
- If the locate phase resolves to no clear target (low confidence, partial input), all highlights clear. We prefer no preview to a flickering one.
- Ghost-preview failures are **silent** — clear highlights and move on. Errors only surface on commit.

#### Commit behavior
- On Enter, the **full pipeline** runs (locate + act). The ghost preview transitions into the canonical "applied" state; rows animate from highlighted to their committed state.
- Because the locate phase has likely already run (and possibly already returned an answer the chat layer can reuse) during typing, commit latency in the common case is dominated by the act phase only.
- Undo (Ctrl+Z + toast) is the safety net for cases where the user committed something they didn't mean — see Section 11.

#### Auto-expand to reveal previewed rows
If a previewed (or applied) row is inside a collapsed parent, the tree auto-expands the path so the highlight is visible. If the row isn't on the current route at all (e.g. user on `/calendar`, AI editing a no-due-date todo), the preview is shown only in the chatbar's search trail.

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
| `confirm_targets` | `ids: ObjectId[]`, `intent: 'delete' \| 'update' \| 'complete' \| 'tag' \| 'create_child' \| 'recurrence'` | Ends Phase 1 with the located todos (one or many) and the predicted action type. `intent` drives ghost-preview border color and is the AI's commitment to which act-phase tool will run. |
| `respond_no_target` | `reason: string` | Ends Phase 1 if the user wants a fresh todo created (no existing target) |

**Loop behavior:** the AI tries `vector_search` first (broad, cheap, returns breadcrumbs so hierarchy is visible), then `expand_todo` to drill down where ambiguity remains. It must end Phase 1 with `confirm_targets` or `respond_no_target` — no free-form output. Ambiguity is a reason to expand further, not to guess. `confirm_targets` may return one id (single-target action) or many (bulk action — e.g. "complete all writing subtasks in Assignment 2" returns the matching subtasks' ids). The AI is instructed to return multiple ids only when the user's instruction clearly addresses a set; ambiguous "the writing one" should resolve to a single id via further drilling, not a bulk guess.

### Phase 2 — Act

**System prompt includes:**
- The located target todos (full records, one or many) OR an indication of "no target — create new"
- The predicted intent from Phase 1
- The user's original message
- The list of available tags (so tag operations are id-correct)
- Action tool definitions

**Tools:**

| Tool | Action |
|------|--------|
| `create_todos` | Insert one or many todos. Each entry may specify `parentId`, so a single call can create a parent plus subtasks atomically. |
| `update_todos` | Modify fields on one or many todos. Body is an array of `{id, fields}` patches. |
| `complete_todos` | Set `isCompleted` on one or many todos (with cascade per the rule above). |
| `delete_todos` | Delete one or many todos and their descendants. |
| `add_tag_to_todos` / `remove_tag_from_todos` | Tag operations across one or many todos. |
| `create_recurrence` | Attach a `RecurrenceRule` to a todo. (Single — bulk recurrence is rare and best handled per-todo.) |

The AI calls **exactly one** action tool (which may itself act on many todos), then produces a short natural-language confirmation to display in chat.

### Embedding pipeline

When a todo is created or its `title`/`description` is updated, an embedding is generated and stored on `todo.embedding`. To keep the request path snappy, embedding generation is queued (fire-and-forget after DB write) — the todo is searchable by vector within ~1 second. `vector_search` falls back to text search if the embedding is missing.

#### Atlas Vector Search index

`vector_search` uses MongoDB Atlas's `$vectorSearch` aggregation stage, which requires an Atlas-hosted cluster (the standalone `mongo:7` in `docker-compose.yml` does NOT support it — point `MONGODB_URI` at Atlas to enable). Create the index once in the Atlas UI on the `todos` collection, named to match `VECTOR_INDEX_NAME` (default `todo_embedding_idx`):

```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 1536, "similarity": "cosine" },
    { "type": "filter", "path": "userId" }
  ]
}
```

`numDimensions: 1536` matches OpenAI `text-embedding-3-small`. The `userId` filter field lets the query scope to the calling user. If the index or `OPENAI_API_KEY` is missing, the locate phase falls back to Mongo's `$text` index defined on `title`/`description`.

### Ghost preview pipeline

Ghost previews use a stripped-down version of the chat flow that runs as the user types:

- **Endpoint:** `POST /api/ai/ghost-preview` (separate from `/api/ai/chat` so it can be rate-limited, cancelled, and skipped under load without affecting commits).
- **Pipeline:** locate phase only. The AI runs the same locate tools as a real chat and must end with `confirm_targets({ ids, intent })` or `respond_no_target`. The act phase does not run.
- **Cost guardrails:** the frontend debounces input (~400ms after last keystroke), enforces a minimum length (~8 chars), and aborts any in-flight request when the input changes. The backend additionally rate-limits ghost previews per session.
- **Embedding race:** if the user just created a todo, its embedding may not be ready yet. `vector_search` falls back to text search; the locate-phase system prompt also tells the AI that recent creates may be missing from vector results — when the user references something just-created, prefer `expand_todo` from root.
- **Failure modes are silent.** A failed ghost preview clears highlights and emits no error. Errors only surface on commit.
- **Reuse on commit (optional optimization):** if the most recent ghost-preview result is fresh and the input hasn't changed since, the commit pipeline may skip locate and proceed straight to act. Implement only if measured commit latency demands it; otherwise re-run locate for correctness.

### Streaming to the frontend

The frontend sends the user message to `POST /api/ai/chat` (commit) or `POST /api/ai/ghost-preview` (during typing) and receives a Server-Sent Events stream. Events:

- `trail_step` — `{label, toolName, args}` for each AI tool call (drives the search trail UI)
- `ghost_preview` — `{todoIds, intent}` emitted during typing; the main view applies highlight borders to those rows
- `ghost_clear` — emitted when the locate phase resolves to no-preview (ambiguous or partial input); the main view clears highlights
- `applied` — `{todoIds, mutation}` emitted on commit; the main view animates from highlight to final state
- `final` — `{message}` final natural-language reply (commit only)
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
PATCH  /api/todos/:id              # response: { before, after } (changed fields only) — supports undo
PATCH  /api/todos/:id/move         # body: { newParentId, newIndex }; response: { before, after } parent linkage for undo
DELETE /api/todos/:id              # response: full subtree snapshot — supports undo restore
POST   /api/todos/:id/complete     # handles cascade; response: list of {todoId, prevIsCompleted, prevCompletedAt}
POST   /api/todos/restore          # body: subtree snapshot from a prior DELETE; recreates with original _ids

GET    /api/tags
POST   /api/tags
DELETE /api/tags/:id

GET    /api/notifications          # query: unread, type, page
GET    /api/notifications/unread-count
PATCH  /api/notifications/:id/read

POST   /api/ai/chat                # body: { message, conversationId?, currentView }
                                   # response: SSE stream (locate + act) — see "Streaming to the frontend"
POST   /api/ai/ghost-preview       # body: { partialMessage, currentView }
                                   # response: SSE stream (locate-only) — see "Ghost preview pipeline"
```

---

## 10. Feature Priority

### MVP (must-have for demo)
- User auth (register, login, logout)
- Todo CRUD via UI (create, edit, complete, delete, nest with cascade)
- Drag-and-drop reordering and reparenting on `/list`
- Markdown rendering in todo descriptions
- Tags (create, assign via UI)
- AI chatbar with two-phase pipeline (locate + act), supporting bulk targets, using `expand_todo` only initially
- Ghost preview during typing (locate-only pipeline; commit on Enter)
- Auto-expand to reveal previewed/applied rows
- Search/filter bar on `/list`
- Calendar view (month grid + upcoming list, with filter bar)
- Priority view (with filter bar)
- Search trail in chat
- Empty-state onboarding on `/list` with example prompts
- Undo (Ctrl+Z + post-action toast) for all mutating actions — manual and AI

### Stretch (if time permits)
- Vector search in the locate phase
- Recurring todos
- Notifications + reminders
- Voice-to-text in the chatbar (Web Speech API)
- Server-Sent Events for live notification delivery

---

## 11. Undo

Every mutating action — manual UI edits AND AI-driven mutations — must be undoable. Ghost previews catch most "I didn't mean that" cases before commit; undo handles the rest. Two surfaces:

1. **Keyboard:** `Ctrl+Z` (and `Cmd+Z` on macOS) anywhere in the app pops the last action off the undo stack and applies its inverse. `Ctrl+Shift+Z` / `Cmd+Shift+Z` redoes.
2. **Toast:** immediately after a mutation commits, a toast appears bottom-center (above the chatbar) with the form *"Marked 'write conclusion' done."* and an `Undo` button. Auto-dismisses after ~5 seconds. Clicking `Undo` is equivalent to `Ctrl+Z`.

### Scope of undoable actions
- `create_todos` → inverse is delete the created todo(s) by id.
- `update_todos` → inverse is update back to the prior field values (snapshot pre-image, per-todo).
- `complete_todos` (and the cascade) → inverse is restore the prior `isCompleted`/`completedAt` of every toggled todo **and** every descendant whose state the cascade actually changed. The undo must restore exactly the rows that were affected, not blanket-uncomplete the subtree.
- `delete_todos` → inverse is restore the deleted todos and all their descendants. This requires the delete to capture a full snapshot before removing.
- `add_tag_to_todos` / `remove_tag_from_todos` → inverse is the opposite tag op on the same set.
- `create_recurrence` → inverse is detach/delete the rule.
- **Drag-drop move** → inverse is restore prior `parentId` and prior position in the old parent's `childIds`. The `move` endpoint returns `{ before, after }` parent linkage to support this.

Tag CRUD and notification reads are **not** undoable — they're either trivially redoable manually or have no meaningful inverse.

### Architecture
- **Client-owned undo stack.** The Angular client maintains a session-only stack (default depth 50). Each entry stores `{ description, inverse: () => Promise<void>, redo: () => Promise<void> }`. Undo runs the inverse against the same REST API that produced the change. No cross-session persistence — refresh wipes the stack.
- **Pre-image snapshots.** For update, complete, delete, and move endpoints, the API responses must include enough state to reconstruct the inverse. Specifically:
  - `PATCH /api/todos/:id` returns `{ before, after }` (only the fields that changed).
  - `POST /api/todos/:id/complete` returns the list of `{ todoId, prevIsCompleted, prevCompletedAt }` for every row the cascade touched.
  - `DELETE /api/todos/:id` returns the full subtree document(s) that were removed, plus their parent linkage, so a single restore endpoint can recreate them with original IDs.
- **Restore endpoint.** `POST /api/todos/restore` accepts a delete-snapshot and recreates the subtree with original `_id`s and `parentId`/`childIds` linkage intact. This is the only "magic" endpoint added for undo; everything else uses existing CRUD.
- **AI-driven actions register on the same stack.** When the SSE `applied` event arrives, the chat service pushes an undo entry just like a manual click would. The toast for AI actions reads *"AI: <action>. Undo?"* so it's clear what's being undone.

### Edge cases
- **Stale undo:** if the user has manually changed the affected todo since the action was pushed, the inverse may conflict. Detect by comparing `updatedAt` to the snapshot's `updatedAt`; if mismatched, the toast offers `Undo anyway` and the action is best-effort. Don't block.
- **Undo across navigation:** the stack lives on a singleton service, not on a page, so it survives route changes (consistent with the chatbar architecture).
- **Modal-open state:** if undo restores a todo that the modal currently has open, the modal updates in place via `TaskService` like any other mutation.

---

## 12. Glossary

- **AUI** — informal mashup of "AI" and "UI". Not a formal acronym; reused across the team's projects (also AUI Spreadsheet) to brand AI-driven interfaces.
- **Locate phase** — first AI call, narrows down which todo(s) the user is referring to.
- **Act phase** — second AI call, performs the operation on the located todo(s).
- **Search trail** — the in-chat stream of tool-call labels showing the AI's reasoning steps as they happen.
- **Ghost preview** — the colored highlights applied to todo rows during typing, before the user has pressed Enter. Driven by a locate-only AI pipeline; cleared if the input changes such that no clear target remains.
- **Bulk targets** — when a single user instruction resolves to multiple todos (e.g. "complete all writing subtasks"). Phase 1 returns an id array via `confirm_targets`; Phase 2 acts on all of them in one tool call.
- **Cascade (completion)** — checking a parent complete recursively checks all descendants. Unchecking does not cascade.
