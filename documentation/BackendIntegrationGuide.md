# AUITodo Backend Integration Guide

This document outlines the key features, data models, and interaction patterns currently implemented in the AUITodo Angular frontend. It serves as a contract/blueprint for building the accompanying backend (e.g., Node.js/Express + MongoDB).

---

## 1. Core Data Models

The frontend relies heavily on the `Task` model (`task.model.ts`). The backend schema must support recursive hierarchical relationships (tasks within tasks).

### Task Interface
```typescript
interface Task {
  id: string;             // Unique identifier (e.g., MongoDB ObjectId)
  title: string;          // Main task name
  status: 'In Progress' | 'To Do' | 'Done';
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  dueDate?: string;       // ISO Date string
  estimatedTime?: string; // e.g., '2 hrs'
  energyLevel?: 'Low' | 'Medium' | 'High';
  description?: string;   // Markdown supported string
  subtasks?: Task[];      // Nested array of child tasks (populated on fetch)
  
  // Potential backend fields needed:
  parentId?: string | null; // For establishing the tree hierarchy
  userId: string;           // For multi-tenant isolation
  orderIndex: number;       // For maintaining custom drag-and-drop sorting
}
```

---

## 2. Standard CRUD Operations

The frontend requires standard RESTful endpoints for manual task management:

- **`GET /api/tasks`**: Fetch the user's entire task tree. (Should ideally return a nested JSON structure or a flat list with `parentId` references that the frontend can assemble).
- **`POST /api/tasks`**: Create a new task.
- **`PUT /api/tasks/:id`**: Update task metadata (title, status, description, etc.). Triggered when a user clicks "Done" in the `TaskModal`.
- **`DELETE /api/tasks/:id`**: Remove a task and its descendants.

---

## 3. Hierarchical Drag & Drop (Reparenting)

The frontend uses an advanced Drag-and-Drop system to reparent tasks (moving a task to become a child of another task). 

- **Frontend Behavior**: The `DragDropService` calculates the new hierarchy and protects against circular dependencies (e.g., moving a parent into its own child).
- **Backend Requirement**: 
  - **`PUT /api/tasks/:id/reparent`**: Needs an endpoint that accepts `{ newParentId: string }`.
  - The backend MUST validate that the move doesn't create a circular reference before saving to the database.

---

## 4. The AI Assistant Integration

This is the most complex integration point. The AI Chat is not just a conversational bot; it is an "Agent" that can view and modify the user's task tree.

### The AI Payload Request
When a user sends a message (via text or voice), the frontend needs to send context to the AI endpoint:
**`POST /api/ai/chat`**
```json
{
  "message": "Can you push the due date of Clean Garage to this weekend?",
  "context": {
    "currentTasks": [ ... serialized tree ... ],
    "currentTime": "2026-04-25T14:00:00Z"
  }
}
```

### The Live Preview System (ChangeType)
The frontend has a sophisticated "Live Preview" CSS system designed to highlight what the AI is *planning* to do before it permanently alters the database. 

The backend AI logic should return a payload containing both the conversational text AND a structured list of proposed operations:
```json
{
  "responseMessage": "I can move that to Saturday. Should I adjust the subtasks too?",
  "proposedChanges": [
    {
      "taskId": "task-123",
      "changeType": "update", // 'add' | 'update' | 'delete' | 'select' | 'toggle'
      "fieldChanges": [
        { "field": "dueDate", "oldValue": "Tomorrow", "newValue": "Saturday" }
      ]
    }
  ]
}
```
**Frontend Action:** The frontend parses `proposedChanges`, applies the `changeType` metadata to the local models, and highlights the rows (e.g., Yellow for updates with old-value strikethroughs). 

**Execution:** Once the user approves the AI's plan (e.g., "Yes, do it"), the frontend will send a confirmation back to the backend to actually execute the database writes.

---

## 5. Voice & Accessibility (STT / TTS)

The frontend uses native browser Web Speech APIs for Speech-to-Text and Text-to-Speech. 
- **Backend Impact**: None structurally. However, if the backend response is meant to be spoken aloud by the browser TTS, the backend's `responseMessage` string should be kept relatively concise and conversational, avoiding complex markdown syntax that might sound garbled when read by a screen reader.

---

## 6. Authentication & Security

The UI header features a "Test User" profile and "Log Out" button.
- **Backend Requirement**: Needs a standard Auth flow (JWT or session cookies).
- **Frontend Action**: The frontend will need an `AuthInterceptor` added to its Angular HTTP Client to attach Bearer tokens to all outbound requests for the routes mentioned above.
- **Sanitization**: Because task descriptions support Markdown, the backend should ideally sanitize the description inputs (to strip malicious `<script>` tags) before saving, though the frontend `marked` parser should also be configured securely.

---

## Summary of Missing Frontend Hooks
To fully connect the app, the following will need to be written on the Angular side:
1. `TaskService` (currently missing) using `HttpClient` to call the REST APIs.
2. An `AuthService` to manage login state.
3. Swapping out the hardcoded mock data in `MainContentPane` with an `ngOnInit` subscription to the `TaskService`.
