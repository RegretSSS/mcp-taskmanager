# MCP 任务管理器

用于任务管理的模型上下文协议(MCP)服务器。这允许Claude Desktop（或任何MCP客户端）在结构化工作流系统中管理和执行任务。相较原始版本增加ApprovedRequest概念，以免list命令污染大模型上下文。

## 主要特点

- **任务工作流管理**：在结构化工作流中创建、跟踪和完成任务
- **审批系统**：具有任务完成和审批阶段的两步验证
- **独立的已批准请求**：已完成的请求会移至单独的列表，以便更好地组织
- **详细的进度跟踪**：每个请求的可视化进度表
- **灵活的任务管理**：在工作流程中添加、更新或删除任务

## 前提条件

- Node.js 18+（macOS通过`brew install node`安装，Windows从nodejs.org下载）
- Claude Desktop（从https://claude.ai/desktop安装）
- tsx（通过`npm install -g tsx`安装）用于开发

## 安装

1. **克隆仓库**:
   ```bash
   git clone https://github.com/RegretSSS/mcp-taskmanager.git
   cd mcp-taskmanager
   ```

2. **安装依赖**:
   ```bash
   npm install
   ```

3. **构建项目**:
   ```bash
   npm run build
   ```

4. **配置Claude Desktop或VSCode**:

找到您的配置文件位置:
- Claude Desktop (macOS): `~/Library/Application Support/Claude/claude_desktop_config.json`
- Claude Desktop (Windows): `%APPDATA%/Claude/claude_desktop_config.json`
- VSCode Roo (Windows): `%APPDATA%/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/cline_mcp_settings.json`

将以下内容添加到您的配置中:
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
注意: 
- 将"path/to/mcp-taskmanager"替换为您克隆仓库的实际路径
- `TASK_MANAGER_FILE_PATH`环境变量是可选的，默认为`~/Documents/tasks.json`

## 开发设置

1. **全局安装tsx**（如果尚未安装）:
   ```bash
   npm install -g tsx
   ```

2. **开发配置**:
   
   对于使用TypeScript源代码进行开发，修改您的配置:
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

## 改进的任务管理

此版本引入了对已批准请求的单独存储，使活动和已完成任务的管理更加容易。当请求完全完成并获得批准后，它会从活动请求列表移至已批准请求列表，保持您的工作空间整洁有序。

## 可用工具

任务管理器提供以下工具:

### 1. request_planning
创建新的用户请求并规划相关任务列表。
- 必填：原始请求(originalRequest)和任务列表(tasks)
- 可选：请求细节(splitDetails)
- 返回：请求ID和任务进度表

### 2. get_next_task
获取下一个待处理任务。
- 输入：请求ID(requestId)
- 返回：下一个未完成的任务信息和进度表
- 说明：需要等待当前任务获得用户批准后才能获取下一个任务

### 3. mark_task_done
将指定任务标记为已完成。
- 必填：请求ID(requestId)和任务ID(taskId)
- 可选：完成详情(completedDetails)
- 返回：更新后的任务状态和进度表

### 4. approve_task_completion
用户确认任务已正确完成。
- 输入：请求ID(requestId)和任务ID(taskId)
- 返回：任务批准状态和进度表
- 说明：只有获得批准后才能继续下一个任务

### 5. approve_request_completion
用户确认所有任务都已完成，结束整个请求。
- 输入：请求ID(requestId)
- 条件：所有任务都必须完成并获得批准
- 返回：请求完成状态
- 说明：将请求移至已批准请求列表

### 6. open_task_details
获取指定任务的详细信息。
- 输入：任务ID(taskId)
- 返回：任务的完整信息，包括状态和完成详情

### 7. list_requests
获取系统中所有活动请求的列表。
- 返回：所有请求的概览，包括完成状态和任务数量

### 8. add_tasks_to_request
向现有请求添加额外的任务。
- 输入：请求ID(requestId)和新任务列表(tasks)
- 条件：请求必须未完成
- 返回：更新后的任务进度表

### 9. update_task
修改未完成任务的标题或描述。
- 输入：请求ID(requestId)和任务ID(taskId)
- 可选：新标题(title)或新描述(description)
- 返回：更新后的任务信息

### 10. delete_task
移除未完成的任务。
- 输入：请求ID(requestId)和任务ID(taskId)
- 条件：任务必须未完成
- 返回：删除后的任务列表

### 11. list_approved_requests
获取所有已完成并批准的请求列表。
- 返回：已批准请求的概览，包括完成时间和任务统计
- 说明：这些请求已从活动列表移至已批准列表

## 使用示例

```typescript
// 创建新请求
{
  "originalRequest": "开发一个待办事项应用",
  "tasks": [
    {
      "title": "设计数据库结构",
      "description": "设计存储待办事项的数据库结构"
    },
    {
      "title": "实现后端API",
      "description": "创建CRUD API接口"
    }
  ]
}

// 获取下一个任务
{
  "requestId": "req-1"
}

// 标记任务完成
{
  "requestId": "req-1",
  "taskId": "task-1",
  "completedDetails": "已完成数据库设计，使用MongoDB存储"
}

// 批准任务完成
{
  "requestId": "req-1",
  "taskId": "task-1"
}

// 在所有任务完成并获得批准后，完成整个请求
{
  "requestId": "req-1"
}

// 查看所有已批准的请求
{}
```

## 调试

如果遇到问题，请检查日志:
- macOS: `tail -n 20 -f ~/Library/Logs/Claude/mcp*.log`
- Windows: 检查启动Claude或VSCode的终端输出

## 开发

```bash
# 安装依赖
npm install

# 构建项目
npm run build

# 开发模式（自动重新构建）
npm run watch
```

## 许可证

MIT

---
注意: 这是[原始mcp-taskmanager仓库](https://github.com/kazuph/mcp-taskmanager)的一个分支。
