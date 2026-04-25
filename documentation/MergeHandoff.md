# AUIToDo — Backend → Frontend Merge Handoff

> **Purpose:** Hand this whole file (or its contents pasted into a chat) to the agent that takes over after Michael's frontend lands. It's self-contained — read it top to bottom and you'll know what to expect, what was decided, and what's still to do.

---

## 1. Project context — read in this order

1. `documentation/ProjectBreakdown.md` — **the spec, source of truth**. Read top to bottom; don't skim.
2. `documentation/TODO.md` — frontend remaining work (written by Michael for his side).
3. `tests/api.test.js` — concrete examples of expected backend behavior for every endpoint.
4. `server/services/aiPipeline.js` and `server/services/todoService.js` — the two heaviest backend pieces.

AUIToDo is a hackathon MEAN-stack project (Mongo + Express + Angular + Node). Two devs: Daniel on backend (this branch), Michael on frontend (`Michael` branch). The product is a nested-todo manager whose primary interaction surface is an AI chatbar, with live UI feedback and undo on every mutation.

---

## 2. Branch state at handoff

```
main         <-- merged Michael's earlier UI work
Daniel       <-- 2 commits ahead of main: spec alignment + this entire backend
Michael      <-- at parity with main; Michael will push fresh commits here
```

Daniel branch is **clean and tested** (17 API tests + 2 AI smoke tests pass). Michael's new frontend work has NOT landed yet. The merge described in §6 happens after he pushes.

---

## 3. What the Daniel branch ships (everything backend)

### Models (`server/models/`)
- `User`, `Todo`, `Tag` per spec §3. Indexes match. `Notification` and `RecurrenceRule` deliberately not implemented yet — see §5.

### Routes & controllers
| Route | Notes |
|-------|-------|
| `POST /api/auth/{register,login,logout}`, `GET /api/auth/me` | Passport local + bcrypt + Mongo-backed sessions (`connect-mongo`). Auto-login on register. |
| `GET /api/todos` (`?parentId=&tag=&status=&dueFrom=&dueTo=&q=`) | List/filter. `q` uses Mongo `$text`. |
| `GET /api/todos/:id`, `GET /api/todos/:id/children` | |
| `POST /api/todos`, `PATCH /api/todos/:id`, `DELETE /api/todos/:id` | Patch returns `{ before, after }` (only changed fields). Delete returns subtree snapshot. |
| `POST /api/todos/:id/complete` | Cascades on check (per spec §3); does NOT cascade on uncheck. Returns `affected: [{todoId, prevIsCompleted, prevCompletedAt}]`. |
| `POST /api/todos/restore` | Re-hydrates a delete-snapshot with original `_id`s. |
| `GET/POST /api/tags`, `DELETE /api/tags/:id` | Delete cascades to remove the tag from every referencing todo. |
| `POST /api/ai/chat` | SSE stream; events: `trail_step`, `preview`, `applied`, `final`, `error`. |

All non-auth routes require `requireAuth` (session-scoped per `req.user._id`).

### AI pipeline (`server/services/aiPipeline.js`, `aiTools.js`, `cerebrasClient.js`)
Two-phase per spec §5:
- **Locate phase** — tools `vector_search`, `expand_todo`, `confirm_target`, `respond_no_target`. Loops until terminal tool fires.
- **Act phase** — tools `create_todo`, `update_todo`, `complete_todo`, `delete_todo`, `add_tag_to_todo`, `remove_tag_from_todo`. Single tool call + a follow-up call for the natural-language confirmation.
- `create_recurrence` is intentionally NOT exposed to the model (recurrence is deferred — see §5).

Vector search uses Atlas `$vectorSearch`; falls back to Mongo `$text` if no embeddings or no Atlas. Embedding generation is fire-and-forget on todo create/update.

### Undo (spec §11)
Every mutating endpoint returns enough state for the client to push an inverse onto a session-only stack. AI-driven mutations emit the same shape via the SSE `applied` event so manual and AI undo land identically. Restore endpoint exists for delete-undo.

### Tests
- `npm test` → `tests/api.test.js`, 17 tests, ~3s, no API cost. Uses `mongodb-memory-server` so it runs offline.
- `npm run test:ai` → `tests/aiChat.test.js`, 2 tests, ~5s, hits real Cerebras + OpenAI (~$0.001/run).

---

## 4. Decisions log (already made — don't re-litigate)

| Decision | Choice | Why |
|---|---|---|
| Stretch scope this pass | Vector search + embeddings only | User-confirmed; recurrence + notifications deferred. |
| Embeddings provider | OpenAI `text-embedding-3-small` (1536 dims) | Spec example; cheap. |
| Conversation persistence | Session-scoped only (no `Conversation` model) | Hackathon scope. Client sends `history: [{role, content}]` in chat body. |
| AI chat body shape | `{ message, history, currentView }` | Spec listed `conversationId?`; renamed since we don't persist. Frontend may need to follow this name. |
| Cerebras model | `gpt-oss-120b` (env-configurable via `CEREBRAS_MODEL`) | Spec §2 lean. |
| Patch behavior | Only changed fields appear in `before`/`after` | Required for clean undo. |
| Cross-user safety | All todo/tag queries scoped by `req.user._id`; restore validates snapshot ownership | |

---

## 5. What's NOT done on Daniel branch

- **Recurrence:** no `RecurrenceRule` model, no cron, no AI tool. (Per spec §6 + §10, stretch.)
- **Notifications:** no `Notification` model, no `/api/notifications/*`, no reminder cron. The frontend bell icon will show 0 unread until this lands. (Per spec §7 + §10, stretch.)
- **Atlas Vector Search index:** must be created manually in Atlas UI. Spec for the index lives in `ProjectBreakdown.md` §5. Until created, locate phase silently falls back to `$text` — which is correct, but degraded.
- **Old hello placeholders:** `server/controllers/helloController.js` and `server/routes/helloRoutes.js` are unmounted but still on disk. Safe to delete during the merge.
- **Reminder offset on `Todo`:** spec mentions it; model doesn't have it. Add when notifications land.

---

## 6. Merge plan

**Prerequisite:** Michael has pushed his frontend work to `origin/Michael`.

```bash
git fetch origin
git checkout -b integration Daniel
git merge origin/Michael       # expect conflicts in client/ → take Michael's
                                #   ...and possibly in documentation/* → resolve carefully
npm install
npm test                        # backend should still be green
cd client && npm install && npm start   # boot frontend
```

### Expected breakage (frontend code expects an old/seed backend)
Per `documentation/TODO.md` the frontend currently runs against an in-memory seed via `TaskService`. Merge is when these wires get cut over to the real API:

1. **HTTP client setup** (TODO.md §5) — `provideHttpClient(withInterceptors(...))`, must include `withCredentials: true` so the session cookie rides on every request.
2. **`AuthService`** — wire `/api/auth/{register,login,logout,me}`. `/login` and `/register` page components, `CanActivate` guard on every route except those two.
3. **`TaskService`** — replace seed data with REST calls. The shape of `Task` returned by `Todo.toClientJSON()` is **already aligned to the spec** (see `server/models/Todo.js`); if Michael's `Task` interface drifts, take the backend's shape.
4. **`TagService`** — `/api/tags`.
5. **`AiChatService`** — POST to `/api/ai/chat`, consume SSE. Map events:
   - `trail_step` → append to active AI message's trail
   - `preview` → `taskService.setPreview(todoId, action)`
   - `applied` → push undo entry + `taskService.upsert(...)` / cascade
   - `final` → set message body, collapse trail
   - `error` → render error
6. **Undo** (spec §11) — `Ctrl+Z` + post-action toast. Per spec the stack is client-owned, depth 50, session-only. Use `applied` event payloads + the `before` field of `PATCH` responses + the snapshot from `DELETE` responses to construct inverses.

### Spec drift to watch for
The spec was edited mid-session (line 17). Live preview is now described as **"ghost previews while typing"**: typing into the chatbar fires preview-only locate runs in real time, with rows highlighting; Enter commits and runs the full pipeline. The current SSE pipeline emits `preview` only AFTER Enter (during the act phase, before the action commits), then holds 300ms. To match the new spec, the chatbar will probably want a **separate preview-only endpoint** that runs locate without acting, debounced on keystroke. The act endpoint stays as-is for the commit. Decide how invasive that change should be — the existing preview-then-apply still works as a fallback if you defer the typing variant.

---

## 7. Env vars required (`.env.example` is up to date; `.env` may need updating)

```
SESSION_SECRET=<long random>
CEREBRAS_API_KEY=<key>
CEREBRAS_BASE_URL=https://api.cerebras.ai/v1
CEREBRAS_MODEL=gpt-oss-120b
OPENAI_API_KEY=<key>
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
VECTOR_INDEX_NAME=todo_embedding_idx
MONGODB_URI=<atlas URI>           # docker-compose's standalone mongo:7 does NOT support $vectorSearch
DB_NAME=AUIToDo
PORT=7040
```

Daniel's local `.env` already has the AI keys set; tests confirmed both Cerebras and OpenAI work end-to-end.

---

## 8. Recommended next-session task list

1. Land the merge per §6.
2. Wire frontend services to backend (Auth, Task, Tag, AiChat).
3. Implement undo UI (Ctrl+Z handler + toast component) using the response shapes from §3.
4. Decide on ghost-preview-while-typing vs. preview-then-apply. If the former, add a `POST /api/ai/preview` (locate-only, no act) and debounce in the chatbar.
5. Once stable, add the deferred stretch features:
   - `Notification` + `RecurrenceRule` models
   - `node-cron` jobs (one-minute tick) for reminder fanout and recurrence rollover
   - `/api/notifications/*` endpoints
   - Frontend `/notifications` route
6. Atlas: create the vector index in the cluster's Search tab (spec in `ProjectBreakdown.md` §5).
7. Delete `server/controllers/helloController.js` and `server/routes/helloRoutes.js`.

---

## 9. Things that will probably bite you

- **Tests need `mongodb-memory-server`'s binary cache** — first run downloads ~150MB. CI environments without internet at test time will fail; bake the cache into the image or pin via `MONGOMS_DOWNLOAD_DIR`.
- **`embedding` field has `select: false`** on the schema (`server/models/Todo.js`) — vectors don't ride out to the client by default. Don't accidentally project them.
- **SSE response on `/api/ai/chat`** — the response body never closes until the pipeline finishes. supertest `.parse()` callback (see `tests/aiChat.test.js`) is the cleanest way to test it; for the frontend, use `EventSource` or a fetch-with-streaming-reader.
- **`req.session.destroy` ordering on logout** — must call after `req.logout(callback)`, not before. Already correct in `authController.logout` but easy to break.
- **Cascade undo asymmetry** — `affected` from `POST /complete` only contains rows that ACTUALLY flipped. If you cascade-complete a tree where some children were already complete, those children are NOT in `affected` (and the inverse should not touch them). Tests in `api.test.js` exercise this.
- **Restore endpoint trusts the snapshot client-side then re-validates ownership server-side.** Ownership check is `userId` per doc — don't loosen it.
