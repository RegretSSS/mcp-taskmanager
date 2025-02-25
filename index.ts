#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import zod from "zod";
const z = zod;

const DEFAULT_PATH = path.join(os.homedir(), "Documents", "tasks.json");
const TASK_FILE_PATH = process.env.TASK_MANAGER_FILE_PATH || DEFAULT_PATH;

interface Task {
  id: string;
  title: string;
  description: string;
  done: boolean;
  approved: boolean;
  completedDetails: string;
}

interface RequestEntry {
  requestId: string;
  originalRequest: string;
  splitDetails: string;
  tasks: Task[];
  completed: boolean; // marked true after all tasks done and request completion approved
}

interface TaskManagerFile {
  requests: RequestEntry[];
  approvedRequests: RequestEntry[];  // 存储已批准完成的请求
}

// 新增已批准请求列表的Schema
const ListApprovedRequestsSchema = z.object({
  method: z.literal("list_approved_requests")
});

// Zod Schemas
const RequestPlanningSchema = z.object({
  originalRequest: z.string(),
  splitDetails: z.string().optional(),
  tasks: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
    })
  ),
});

const GetNextTaskSchema = z.object({
  requestId: z.string(),
});

const MarkTaskDoneSchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
  completedDetails: z.string().optional(),
});

const ApproveTaskCompletionSchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
});

const ApproveRequestCompletionSchema = z.object({
  requestId: z.string(),
});

const OpenTaskDetailsSchema = z.object({
  taskId: z.string(),
});

const ListRequestsSchema = z.object({});

const AddTasksToRequestSchema = z.object({
  requestId: z.string(),
  tasks: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
    })
  ),
});

const UpdateTaskSchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
});

const DeleteTaskSchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
});

// Tools with enriched English descriptions

const REQUEST_PLANNING_TOOL: Tool = {
  name: "request_planning",
  description: "【新建用户请求】创建新的用户请求并规划相关任务列表。\n" +
    "- 必填：原始请求(originalRequest)和任务列表(tasks)\n" +
    "- 可选：请求细节(splitDetails)\n" +
    "- 返回：请求ID和任务进度表",
  inputSchema: {
    type: "object",
    properties: {
      originalRequest: { type: "string" },
      splitDetails: { type: "string" },
      tasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
          },
          required: ["title", "description"],
        },
      },
    },
    required: ["originalRequest", "tasks"],
  },
};

const GET_NEXT_TASK_TOOL: Tool = {
  name: "get_next_task",
  description: "【任务过程管理】获取下一个待处理任务。\n" +
    "- 输入：请求ID(requestId)\n" +
    "- 返回：下一个未完成的任务信息和进度表\n" +
    "- 说明：需要等待当前任务获得用户批准后才能获取下一个任务",
  inputSchema: {
    type: "object",
    properties: {
      requestId: { type: "string" },
    },
    required: ["requestId"],
  },
};

const MARK_TASK_DONE_TOOL: Tool = {
  name: "mark_task_done",
  description: "【标记任务完成】将指定任务标记为已完成。\n" +
    "- 必填：请求ID(requestId)和任务ID(taskId)\n" +
    "- 可选：完成详情(completedDetails)\n" +
    "- 返回：更新后的任务状态和进度表",
  inputSchema: {
    type: "object",
    properties: {
      requestId: { type: "string" },
      taskId: { type: "string" },
      completedDetails: { type: "string" },
    },
    required: ["requestId", "taskId"],
  },
};

const APPROVE_TASK_COMPLETION_TOOL: Tool = {
  name: "approve_task_completion",
  description: "【用户批准任务】用户确认任务已正确完成。\n" +
    "- 输入：请求ID(requestId)和任务ID(taskId)\n" +
    "- 返回：任务批准状态和进度表\n" +
    "- 说明：只有获得批准后才能继续下一个任务",
  inputSchema: {
    type: "object",
    properties: {
      requestId: { type: "string" },
      taskId: { type: "string" },
    },
    required: ["requestId", "taskId"],
  },
};

const APPROVE_REQUEST_COMPLETION_TOOL: Tool = {
  name: "approve_request_completion",
  description: "【完成整个请求】用户确认所有任务都已完成，结束整个请求。\n" +
    "- 输入：请求ID(requestId)\n" +
    "- 条件：所有任务都必须完成并获得批准\n" +
    "- 返回：请求完成状态",
  inputSchema: {
    type: "object",
    properties: {
      requestId: { type: "string" },
    },
    required: ["requestId"],
  },
};

const OPEN_TASK_DETAILS_TOOL: Tool = {
  name: "open_task_details",
  description: "【查看任务详情】获取指定任务的详细信息。\n" +
    "- 输入：任务ID(taskId)\n" +
    "- 返回：任务的完整信息，包括状态和完成详情",
  inputSchema: {
    type: "object",
    properties: {
      taskId: { type: "string" },
    },
    required: ["taskId"],
  },
};

const LIST_REQUESTS_TOOL: Tool = {
  name: "list_requests",
  description: "【查看所有请求】获取系统中所有请求的列表。\n" +
    "- 返回：所有请求的概览，包括完成状态和任务数量",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

const ADD_TASKS_TO_REQUEST_TOOL: Tool = {
  name: "add_tasks_to_request",
  description: "【添加新任务】向现有请求添加额外的任务。\n" +
    "- 输入：请求ID(requestId)和新任务列表(tasks)\n" +
    "- 条件：请求必须未完成\n" +
    "- 返回：更新后的任务进度表",
  inputSchema: {
    type: "object",
    properties: {
      requestId: { type: "string" },
      tasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
          },
          required: ["title", "description"],
        },
      },
    },
    required: ["requestId", "tasks"],
  },
};

const UPDATE_TASK_TOOL: Tool = {
  name: "update_task",
  description: "【更新任务信息】修改未完成任务的标题或描述。\n" +
    "- 输入：请求ID(requestId)和任务ID(taskId)\n" +
    "- 可选：新标题(title)或新描述(description)\n" +
    "- 返回：更新后的任务信息",
  inputSchema: {
    type: "object",
    properties: {
      requestId: { type: "string" },
      taskId: { type: "string" },
      title: { type: "string" },
      description: { type: "string" },
    },
    required: ["requestId", "taskId"],
  },
};

const DELETE_TASK_TOOL: Tool = {
  name: "delete_task",
  description: "【删除任务】移除未完成的任务。\n" +
    "- 输入：请求ID(requestId)和任务ID(taskId)\n" +
    "- 条件：任务必须未完成\n" +
    "- 返回：删除后的任务列表",
  inputSchema: {
    type: "object",
    properties: {
      requestId: { type: "string" },
      taskId: { type: "string" },
    },
    required: ["requestId", "taskId"],
  },
};

const LIST_APPROVED_REQUESTS_TOOL: Tool = {
  name: "list_approved_requests",
  description: "【查看已批准请求】获取所有已完成并批准的请求列表。\n" +
    "- 返回：已批准请求的概览，包括完成时间和任务统计",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

class TaskManagerServer {
  private requestCounter = 0;
  private taskCounter = 0;
  private data: TaskManagerFile = { requests: [], approvedRequests: [] };

  constructor() {
    this.loadTasks();
  }

  private async loadTasks() {
    try {
      const data = await fs.readFile(TASK_FILE_PATH, "utf-8");
      const parsed = JSON.parse(data);
      // 确保approvedRequests存在
      this.data = {
        requests: parsed.requests || [],
        approvedRequests: parsed.approvedRequests || []
      };
      const allTaskIds: number[] = [];
      const allRequestIds: number[] = [];

      for (const req of this.data.requests) {
        const reqNum = Number.parseInt(req.requestId.replace("req-", ""), 10);
        if (!Number.isNaN(reqNum)) {
          allRequestIds.push(reqNum);
        }
        for (const t of req.tasks) {
          const tNum = Number.parseInt(t.id.replace("task-", ""), 10);
          if (!Number.isNaN(tNum)) {
            allTaskIds.push(tNum);
          }
        }
      }

      this.requestCounter =
        allRequestIds.length > 0 ? Math.max(...allRequestIds) : 0;
      this.taskCounter = allTaskIds.length > 0 ? Math.max(...allTaskIds) : 0;
    } catch (error) {
      this.data = { requests: [], approvedRequests: [] };
    }
  }

  private async saveTasks() {
    try {
      await fs.writeFile(
        TASK_FILE_PATH,
        JSON.stringify(this.data, null, 2),
        "utf-8"
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("EROFS")) {
        console.error("EROFS: read-only file system. Cannot save tasks.");
        throw error;
      }
      throw error;
    }
  }

  private formatTaskProgressTable(requestId: string): string {
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) return "Request not found";

    let table = "\nProgress Status:\n";
    table += "| Task ID | Title | Description | Status | Approval |\n";
    table += "|----------|----------|------|------|----------|\n";

    for (const task of req.tasks) {
      const status = task.done ? "✅ Done" : "🔄 In Progress";
      const approved = task.approved ? "✅ Approved" : "⏳ Pending";
      table += `| ${task.id} | ${task.title} | ${task.description} | ${status} | ${approved} |\n`;
    }

    return table;
  }

  private formatRequestsList(): string {
    let output = "\nRequests List:\n";
    output +=
      "| Request ID | Original Request | Total Tasks | Completed | Approved |\n";
    output +=
      "|------------|------------------|-------------|-----------|----------|\n";

    for (const req of this.data.requests) {
      const totalTasks = req.tasks.length;
      const completedTasks = req.tasks.filter((t) => t.done).length;
      const approvedTasks = req.tasks.filter((t) => t.approved).length;
      output += `| ${req.requestId} | ${req.originalRequest.substring(0, 30)}${req.originalRequest.length > 30 ? "..." : ""} | ${totalTasks} | ${completedTasks} | ${approvedTasks} |\n`;
    }

    return output;
  }

  public async requestPlanning(
    originalRequest: string,
    tasks: { title: string; description: string }[],
    splitDetails?: string
  ) {
    await this.loadTasks();
    this.requestCounter += 1;
    const requestId = `req-${this.requestCounter}`;

    const newTasks: Task[] = [];
    for (const taskDef of tasks) {
      this.taskCounter += 1;
      newTasks.push({
        id: `task-${this.taskCounter}`,
        title: taskDef.title,
        description: taskDef.description,
        done: false,
        approved: false,
        completedDetails: "",
      });
    }

    this.data.requests.push({
      requestId,
      originalRequest,
      splitDetails: splitDetails || originalRequest,
      tasks: newTasks,
      completed: false,
    });

    await this.saveTasks();

    const progressTable = this.formatTaskProgressTable(requestId);

    return {
      status: "planned",
      requestId,
      totalTasks: newTasks.length,
      tasks: newTasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
      })),
      message: `Tasks have been successfully added. Please use 'get_next_task' to retrieve the first task.\n${progressTable}`,
    };
  }

  public async getNextTask(requestId: string) {
    await this.loadTasks();
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) {
      return { status: "error", message: "Request not found" };
    }
    if (req.completed) {
      return {
        status: "already_completed",
        message: "Request already completed.",
      };
    }
    const nextTask = req.tasks.find((t) => !t.done);
    if (!nextTask) {
      // all tasks done?
      const allDone = req.tasks.every((t) => t.done);
      if (allDone && !req.completed) {
        const progressTable = this.formatTaskProgressTable(requestId);
        return {
          status: "all_tasks_done",
          message: `All tasks have been completed. Awaiting request completion approval.\n${progressTable}`,
        };
      }
      return { status: "no_next_task", message: "No undone tasks found." };
    }

    const progressTable = this.formatTaskProgressTable(requestId);
    return {
      status: "next_task",
      task: {
        id: nextTask.id,
        title: nextTask.title,
        description: nextTask.description,
      },
      message: `Next task is ready. Task approval will be required after completion.\n${progressTable}`,
    };
  }

  public async markTaskDone(
    requestId: string,
    taskId: string,
    completedDetails?: string
  ) {
    await this.loadTasks();
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) return { status: "error", message: "Request not found" };
    const task = req.tasks.find((t) => t.id === taskId);
    if (!task) return { status: "error", message: "Task not found" };
    if (task.done)
      return {
        status: "already_done",
        message: "Task is already marked done.",
      };

    task.done = true;
    task.completedDetails = completedDetails || "";
    await this.saveTasks();
    return {
      status: "task_marked_done",
      requestId: req.requestId,
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        completedDetails: task.completedDetails,
        approved: task.approved,
      },
    };
  }

  public async approveTaskCompletion(requestId: string, taskId: string) {
    await this.loadTasks();
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) return { status: "error", message: "Request not found" };
    const task = req.tasks.find((t) => t.id === taskId);
    if (!task) return { status: "error", message: "Task not found" };
    if (!task.done) return { status: "error", message: "Task not done yet." };
    if (task.approved)
      return { status: "already_approved", message: "Task already approved." };

    task.approved = true;
    await this.saveTasks();
    return {
      status: "task_approved",
      requestId: req.requestId,
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        completedDetails: task.completedDetails,
        approved: task.approved,
      },
    };
  }

  public async approveRequestCompletion(requestId: string) {
    await this.loadTasks();
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) return { status: "error", message: "Request not found" };

    // Check if all tasks are done and approved
    const allDone = req.tasks.every((t) => t.done);
    if (!allDone) {
      return { status: "error", message: "Not all tasks are done." };
    }
    const allApproved = req.tasks.every((t) => t.done && t.approved);
    if (!allApproved) {
      return { status: "error", message: "Not all done tasks are approved." };
    }

    // 将请求从活动列表移动到已批准列表
    this.data.requests = this.data.requests.filter(r => r.requestId !== requestId);
    req.completed = true;
    this.data.approvedRequests.push(req);
    
    await this.saveTasks();
    return {
      status: "request_approved_complete",
      requestId: req.requestId,
      message: "Request is fully completed and approved, and moved to approved list.",
    };
  }

  public async openTaskDetails(taskId: string) {
    await this.loadTasks();
    for (const req of this.data.requests) {
      const target = req.tasks.find((t) => t.id === taskId);
      if (target) {
        return {
          status: "task_details",
          requestId: req.requestId,
          originalRequest: req.originalRequest,
          splitDetails: req.splitDetails,
          completed: req.completed,
          task: {
            id: target.id,
            title: target.title,
            description: target.description,
            done: target.done,
            approved: target.approved,
            completedDetails: target.completedDetails,
          },
        };
      }
    }
    return { status: "task_not_found", message: "No such task found" };
  }

  public async listRequests() {
    await this.loadTasks();
    const requestsList = this.formatRequestsList();
    return {
      status: "requests_listed",
      message: `Current requests in the system:\n${requestsList}`,
      requests: this.data.requests.map((req) => ({
        requestId: req.requestId,
        originalRequest: req.originalRequest,
        totalTasks: req.tasks.length,
        completedTasks: req.tasks.filter((t) => t.done).length,
        approvedTasks: req.tasks.filter((t) => t.approved).length,
      })),
    };
  }

  public async addTasksToRequest(
    requestId: string,
    tasks: { title: string; description: string }[]
  ) {
    await this.loadTasks();
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) return { status: "error", message: "Request not found" };
    if (req.completed)
      return {
        status: "error",
        message: "Cannot add tasks to completed request",
      };

    const newTasks: Task[] = [];
    for (const taskDef of tasks) {
      this.taskCounter += 1;
      newTasks.push({
        id: `task-${this.taskCounter}`,
        title: taskDef.title,
        description: taskDef.description,
        done: false,
        approved: false,
        completedDetails: "",
      });
    }

    req.tasks.push(...newTasks);
    await this.saveTasks();

    const progressTable = this.formatTaskProgressTable(requestId);
    return {
      status: "tasks_added",
      message: `Added ${newTasks.length} new tasks to request.\n${progressTable}`,
      newTasks: newTasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
      })),
    };
  }

  public async updateTask(
    requestId: string,
    taskId: string,
    updates: { title?: string; description?: string }
  ) {
    await this.loadTasks();
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) return { status: "error", message: "Request not found" };

    const task = req.tasks.find((t) => t.id === taskId);
    if (!task) return { status: "error", message: "Task not found" };
    if (task.done)
      return { status: "error", message: "Cannot update completed task" };

    if (updates.title) task.title = updates.title;
    if (updates.description) task.description = updates.description;

    await this.saveTasks();

    const progressTable = this.formatTaskProgressTable(requestId);
    return {
      status: "task_updated",
      message: `Task ${taskId} has been updated.\n${progressTable}`,
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
      },
    };
  }

  public async listApprovedRequests() {
    await this.loadTasks();
    let output = "\nApproved Requests List:\n";
    output +=
      "| Request ID | Original Request | Total Tasks | Completion Time |\n";
    output +=
      "|------------|------------------|-------------|-----------------||\n";

    for (const req of this.data.approvedRequests) {
      const totalTasks = req.tasks.length;
      output += `| ${req.requestId} | ${req.originalRequest.substring(0, 30)}${
        req.originalRequest.length > 30 ? "..." : ""
      } | ${totalTasks} | ${new Date().toLocaleString()} |\n`;
    }

    return {
      status: "approved_requests_listed",
      message: `Completed and approved requests:\n${output}`,
      requests: this.data.approvedRequests.map((req) => ({
        requestId: req.requestId,
        originalRequest: req.originalRequest,
        totalTasks: req.tasks.length,
      })),
    };
  }

  public async deleteTask(requestId: string, taskId: string) {
    await this.loadTasks();
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) return { status: "error", message: "Request not found" };

    const taskIndex = req.tasks.findIndex((t) => t.id === taskId);
    if (taskIndex === -1) return { status: "error", message: "Task not found" };
    if (req.tasks[taskIndex].done)
      return { status: "error", message: "Cannot delete completed task" };

    req.tasks.splice(taskIndex, 1);
    await this.saveTasks();

    const progressTable = this.formatTaskProgressTable(requestId);
    return {
      status: "task_deleted",
      message: `Task ${taskId} has been deleted.\n${progressTable}`,
    };
  }
}

const server = new Server(
  {
    name: "task-manager-server",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const taskManagerServer = new TaskManagerServer();

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    REQUEST_PLANNING_TOOL,
    GET_NEXT_TASK_TOOL,
    MARK_TASK_DONE_TOOL,
    APPROVE_TASK_COMPLETION_TOOL,
    APPROVE_REQUEST_COMPLETION_TOOL,
    OPEN_TASK_DETAILS_TOOL,
    LIST_REQUESTS_TOOL,
    ADD_TASKS_TO_REQUEST_TOOL,
    UPDATE_TASK_TOOL,
    DELETE_TASK_TOOL,
    LIST_APPROVED_REQUESTS_TOOL,
  ],
}));

// 添加已批准请求列表的处理器
server.setRequestHandler(ListApprovedRequestsSchema, async () => {
  const result = await taskManagerServer.listApprovedRequests();
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "request_planning": {
        const parsed = RequestPlanningSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }
        const { originalRequest, tasks, splitDetails } = parsed.data;
        const result = await taskManagerServer.requestPlanning(
          originalRequest,
          tasks,
          splitDetails
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "get_next_task": {
        const parsed = GetNextTaskSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }
        const result = await taskManagerServer.getNextTask(
          parsed.data.requestId
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "mark_task_done": {
        const parsed = MarkTaskDoneSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }
        const { requestId, taskId, completedDetails } = parsed.data;
        const result = await taskManagerServer.markTaskDone(
          requestId,
          taskId,
          completedDetails
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "approve_task_completion": {
        const parsed = ApproveTaskCompletionSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }
        const { requestId, taskId } = parsed.data;
        const result = await taskManagerServer.approveTaskCompletion(
          requestId,
          taskId
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "approve_request_completion": {
        const parsed = ApproveRequestCompletionSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }
        const { requestId } = parsed.data;
        const result =
          await taskManagerServer.approveRequestCompletion(requestId);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "open_task_details": {
        const parsed = OpenTaskDetailsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }
        const { taskId } = parsed.data;
        const result = await taskManagerServer.openTaskDetails(taskId);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "list_requests": {
        const parsed = ListRequestsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }
        const result = await taskManagerServer.listRequests();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "add_tasks_to_request": {
        const parsed = AddTasksToRequestSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }
        const { requestId, tasks } = parsed.data;
        const result = await taskManagerServer.addTasksToRequest(
          requestId,
          tasks
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "update_task": {
        const parsed = UpdateTaskSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }
        const { requestId, taskId, title, description } = parsed.data;
        const result = await taskManagerServer.updateTask(requestId, taskId, {
          title,
          description,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "delete_task": {
        const parsed = DeleteTaskSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }
        const { requestId, taskId } = parsed.data;
        const result = await taskManagerServer.deleteTask(requestId, taskId);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "list_approved_requests": {
        const result = await taskManagerServer.listApprovedRequests();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `Task Manager MCP Server running. Saving tasks at: ${TASK_FILE_PATH}`
  );
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
