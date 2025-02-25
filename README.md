# MCP TaskManager

Model Context Protocol server for Task Management. This allows Claude Desktop (or any MCP client) to manage and execute tasks in a structured workflow system.

## Key Features

- **Task Workflow Management**: Create, track, and complete tasks in a structured workflow
- **Approval System**: Two-step verification with task completion and approval phases
- **Separate Approved Requests**: Completed requests are moved to a separate list for better organization
- **Detailed Progress Tracking**: Visual progress tables for each request
- **Flexible Task Management**: Add, update, or delete tasks during the workflow

## Prerequisites

- Node.js 18+ (install via `brew install node` on macOS or download from nodejs.org for Windows)
- Claude Desktop (install from https://claude.ai/desktop)
- tsx (install via `npm install -g tsx`) for development

## Installation

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/RegretSSS/mcp-taskmanager.git
   cd mcp-taskmanager
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Build the Project**:
   ```bash
   npm run build
   ```

4. **Configure Claude Desktop or VSCode**:

Locate your configuration file at:
- Claude Desktop (macOS): `~/Library/Application Support/Claude/claude_desktop_config.json`
- Claude Desktop (Windows): `%APPDATA%/Claude/claude_desktop_config.json`
- VSCode Roo (Windows): `%APPDATA%/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/cline_mcp_settings.json`

Add the following to your configuration:
```json
{
  "mcpServers": {
    "taskmanager": {
      "command": "node",
      "args": ["path/to/mcp-taskmanager/dist/index.js"],
      "env": {
        "TASK_MANAGER_FILE_PATH": "path/to/save/tasks.json"
      }
    }
  }
}
```
Note:
- Replace "path/to/mcp-taskmanager" with the actual path to your cloned repository
- The `TASK_MANAGER_FILE_PATH` environment variable is optional and defaults to `~/Documents/tasks.json`

## Development Setup

1. **Install tsx globally** (if not already installed):
   ```bash
   npm install -g tsx
   ```

2. **Development Configuration**:
   
   For development with the TypeScript source, modify your config:
   ```json
   {
     "mcpServers": {
       "taskmanager": {
         "command": "tsx",
         "args": ["path/to/mcp-taskmanager/index.ts"]
       }
     }
   }
   ```

## Improved Task Management

This version introduces a separate storage for approved requests, making it easier to manage active and completed tasks. When a request is fully completed and approved, it's moved from the active requests list to the approved requests list, keeping your workspace clean and organized.

## Available Tools

The TaskManager provides the following tools:

### 1. request_planning
Create a new user request and plan related tasks.
- Required: originalRequest and tasks list
- Optional: splitDetails
- Returns: Request ID and task progress table

### 2. get_next_task
Get the next pending task.
- Input: requestId
- Returns: Next incomplete task information and progress table
- Note: Requires previous task to be approved before getting the next one

### 3. mark_task_done
Mark a specific task as completed.
- Required: requestId and taskId
- Optional: completedDetails
- Returns: Updated task status and progress table

### 4. approve_task_completion
User confirms a task has been correctly completed.
- Input: requestId and taskId
- Returns: Task approval status and progress table
- Note: Approval is required before proceeding to the next task

### 5. approve_request_completion
User confirms all tasks are completed, finalizing the entire request.
- Input: requestId
- Condition: All tasks must be completed and approved
- Returns: Request completion status
- Note: Moves the request to the approved requests list

### 6. open_task_details
Get detailed information about a specific task.
- Input: taskId
- Returns: Complete task information including status and completion details

### 7. list_requests
Get a list of all active requests in the system.
- Returns: Overview of all requests including completion status and task count

### 8. add_tasks_to_request
Add additional tasks to an existing request.
- Input: requestId and new tasks list
- Condition: Request must not be completed
- Returns: Updated task progress table

### 9. update_task
Modify the title or description of an incomplete task.
- Input: requestId and taskId
- Optional: new title or description
- Returns: Updated task information

### 10. delete_task
Remove an incomplete task.
- Input: requestId and taskId
- Condition: Task must not be completed
- Returns: Updated task list

### 11. list_approved_requests
Get a list of all completed and approved requests.
- Returns: Overview of approved requests including completion time and task statistics
- Note: These requests have been moved from the active list to the approved list

## Example Usage

```typescript
// Create a new request
{
  "originalRequest": "Develop a todo application",
  "tasks": [
    {
      "title": "Design database structure",
      "description": "Design the database structure for storing todo items"
    },
    {
      "title": "Implement backend API",
      "description": "Create CRUD API endpoints"
    }
  ]
}

// Get the next task
{
  "requestId": "req-1"
}

// Mark task as completed
{
  "requestId": "req-1",
  "taskId": "task-1",
  "completedDetails": "Completed database design using MongoDB"
}

// Approve task completion
{
  "requestId": "req-1",
  "taskId": "task-1"
}

// After all tasks are completed and approved, finalize the request
{
  "requestId": "req-1"
}

// View all approved requests
{}
```

## Debugging

If you run into issues, check the logs:
- macOS: `tail -n 20 -f ~/Library/Logs/Claude/mcp*.log`
- Windows: Check the terminal output where you launched Claude or VSCode

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Development with auto-rebuild
npm run watch
```

## License

MIT

---
Note: This is a fork of the [original mcp-taskmanager repository](https://github.com/kazuph/mcp-taskmanager).
