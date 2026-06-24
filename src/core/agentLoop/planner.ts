import type {
  AgentDynamicTask,
  AgentTaskStatus,
} from "@/core/agentLoop/types";

let taskCounter = 0;

function nextTaskId(): string {
  taskCounter += 1;
  return `task-${Date.now()}-${taskCounter}`;
}

export function initialTasksForMode(
  mode: "investigation" | "goal",
  goal: string,
): AgentDynamicTask[] {
  if (mode === "investigation") {
    return [
      task("Inspect diagnostics", 0),
      task("Search repository", 1),
      task("Trace references", 2),
      task("Identify root cause", 3),
    ];
  }
  const short =
    goal.trim().length > 48 ? `${goal.trim().slice(0, 45)}…` : goal.trim();
  return [
    task("Explore codebase", 0),
    task(`Plan: ${short}`, 1),
    task("Apply changes", 2),
    task("Verify and repair", 3),
  ];
}

function task(title: string, order: number): AgentDynamicTask {
  return {
    id: nextTaskId(),
    title,
    status: "pending",
    order,
  };
}

export function setTaskStatus(
  tasks: readonly AgentDynamicTask[],
  titleIncludes: string,
  status: AgentTaskStatus,
): AgentDynamicTask[] {
  const needle = titleIncludes.toLowerCase();
  return tasks.map((t) =>
    t.title.toLowerCase().includes(needle) ? { ...t, status } : t,
  );
}

export function activateTask(
  tasks: readonly AgentDynamicTask[],
  titleIncludes: string,
): AgentDynamicTask[] {
  const needle = titleIncludes.toLowerCase();
  return tasks.map((t) => {
    if (t.title.toLowerCase().includes(needle)) {
      return { ...t, status: "active" as const };
    }
    if (t.status === "active") {
      return { ...t, status: "done" as const };
    }
    return t;
  });
}

export function addDynamicTask(
  tasks: readonly AgentDynamicTask[],
  title: string,
  afterOrder?: number,
): AgentDynamicTask[] {
  const order =
    afterOrder !== undefined
      ? afterOrder + 0.5
      : tasks.length > 0
        ? Math.max(...tasks.map((t) => t.order)) + 1
        : 0;
  return [...tasks, { id: nextTaskId(), title, status: "pending", order }];
}

export function removeTask(
  tasks: readonly AgentDynamicTask[],
  taskId: string,
): AgentDynamicTask[] {
  return tasks.map((t) =>
    t.id === taskId ? { ...t, status: "removed" as const } : t,
  );
}

export function reorderTasks(
  tasks: readonly AgentDynamicTask[],
  taskId: string,
  newOrder: number,
): AgentDynamicTask[] {
  return tasks.map((t) => (t.id === taskId ? { ...t, order: newOrder } : t));
}

export function tasksFromFilePaths(
  paths: readonly string[],
  baseOrder: number,
): AgentDynamicTask[] {
  return paths.map((p, i) => ({
    id: nextTaskId(),
    title: `Edit ${p}`,
    status: "pending" as const,
    order: baseOrder + i * 0.01,
  }));
}

export function sortedActiveTasks(
  tasks: readonly AgentDynamicTask[],
): AgentDynamicTask[] {
  return [...tasks]
    .filter((t) => t.status !== "removed")
    .sort((a, b) => a.order - b.order);
}
