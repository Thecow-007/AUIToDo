Project Design Document: AI-Powered TODO Application
1. System Architecture & Tech Stack

This section defines the foundational technologies for the application. The system is designed to run seamlessly in a containerized environment, facilitating easy deployment to a Linux server using Docker, while maintaining full compatibility for local development on a Windows machine.

    Backend: Node.js with Express.

    Database: MongoDB (hosted via MongoDB Atlas for Vector Search capabilities) with Mongoose ODM.

    Frontend: A component-based framework (e.g., React or Vue.js) to manage the complex state of the three-pane UI and real-time AI chat updates.

    AI Orchestration: Vercel AI SDK or LangChain for managing LLM tools, embeddings, and context.

    Deployment: Docker and Docker Compose for bundling the API, frontend, and any local inference engines into a portable stack.

2. Database Schema & Data Models

The application uses a flattened NoSQL structure to optimize token usage for the AI while maintaining relational integrity for nested tasks.
Mongoose Schemas

    Task Schema: Contains id, title, description, isCompleted, priority (Low, Medium, High, Urgent), dueDate, completedAt.

    Relational Fields: userId, parentTaskId (null for root tasks), subTaskIds (array of child IDs), tagIds, dependencyIds.

    AI Metadata: estimatedDuration, actualDuration, energyLevel, context, vector_coords (for Atlas Vector Search).

    Embedded Objects: RecurrenceSchema (frequency, interval, regeneration type) and ReminderSchema.

    Tag Schema: userId, label, color, icon.

Required Indexes
Index Target	Type	Purpose
userId + parentTaskId	Compound	Fast retrieval of root tasks and specific child branches.
userId + isCompleted + dueDate	Compound	Rapid querying of active, upcoming tasks for the AI context.
vector_coords	2dsphere	Enables cosine similarity search for semantic natural language queries.
3. User Interface (UI) Layout & Components

The interface is structured into three distinct, persistent panes. State management must ensure that actions in the AI Chat or Nav Pane instantly reflect in the Main Content.
3.1 Navigation Pane (Left-Anchored)

This pane occupies the full vertical height of the left side and serves as the primary routing and filtering mechanism.

    List View: A filterable tree view displaying all tasks. It visually represents hierarchies using indentation or collapsible toggles.

    Calendar View: Displays a mini-calendar widget. Dates with due tasks feature indicator dots. Below the calendar, a chronologically sorted list shows tasks with upcoming due dates.

    Urgent View: An algorithmic sorting view that combines task attributes (e.g., high priority, overdue, high energy level, blocking dependencies) to generate a dynamic "do this now" list.

    Search View: A dedicated input area for detailed, multi-parameter filtering (by tag, date range, status, or keyword).

3.2 Main Content Pane (Center)

This dynamic viewing area renders the details of the task currently selected from the Navigation Pane.

    Root Task Display: When an out-most (parent) task is selected, this area displays the full tree breakdown of that specific project.

    Detail Presentation: Renders the title, description, tags, status, and all AI metadata (energy level, estimated duration).

    Interaction Modals: Clicking on specific fields or sub-tasks opens targeted modals for finer CRUD control (e.g., adjusting recurrence schedules, editing the description, or reassigning dependencies) without navigating away from the tree view.

3.3 AI Chat Box (Bottom-Anchored)

This persistent component sits at the bottom of the viewport, allowing users to interact with their tasks conversationally while viewing them.

    Message History: A scrollable container displaying the ongoing dialogue between the user and the AI agent.

    Input Area: A text field for submitting natural language prompts (e.g., "Reschedule all low-energy tasks to Friday").

    Voice Integration Hooks: UI space reserved for a microphone toggle button. This will eventually pipe audio to a Speech-to-Text (STT) service, submit the transcription as a prompt, and utilize a Text-to-Speech (TTS) service to read the AI's response aloud.

4. AI Integration & Agent Tools

The AI operates using a strict Function Calling (Tools) architecture to ensure database integrity. It does not manipulate the database directly through raw queries.
Flattened Context Strategy

When a user interacts with the chat, the system provides the AI with a flattened JSON array of tasks relevant to the current UI view or query. Each object includes its parentTaskId and a text-based path string (e.g., Home > Garage > Organize Tools) to maintain hierarchical awareness without deep nesting.
Core Tool Definitions
Tool Name	Parameters	Action
search_tasks	query (string), filters (object)	Uses Atlas Vector Search to find tasks matching the semantic intent of the query.
get_task_hierarchy	rootId (UUID)	Fetches a specific parent task and exactly one level of its immediate children.
create_task	taskData (object), parentId (UUID, optional)	Validates and inserts a new task. If parentId is provided, updates the parent's subTaskIds array.
update_task	id (UUID), updates (object)	Modifies specific fields. When updating isCompleted on a parent, it cascades the status to all children.