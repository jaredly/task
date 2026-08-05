import {
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";

export type WorkflowStage = "research" | "plan" | "implement" | "commit";

export const workflowStages: readonly WorkflowStage[] = [
  "research",
  "plan",
  "implement",
  "commit",
];

export type AgentState = {
  version: 1;
  agent: "codex-acp";
  sessionId: string;
  cwd: string;
  taskId: string;
  lastCompletedStage: WorkflowStage;
};

export type TaskTarget = {
  fullName: string;
  taskFile: string;
  directory: string;
};

export function defaultBrief(): string {
  return "task.md";
}

export function initialStage(): WorkflowStage {
  return "research";
}

export function nextStage(
  lastCompletedStage?: WorkflowStage,
): WorkflowStage | undefined {
  if (!lastCompletedStage) return initialStage();
  if (lastCompletedStage === "research") return "plan";
  if (lastCompletedStage === "plan") return "implement";
  if (lastCompletedStage === "implement") return "commit";
  return undefined;
}

export function inferStageFromArtifacts(target: TaskTarget): WorkflowStage | undefined {
  if (!existsSync(join(target.directory, "research.md"))) return "research";
  if (!existsSync(join(target.directory, "plan.md"))) return "plan";
  return "implement";
}

export function hasOpenQuestions(target: TaskTarget): boolean {
  const research = join(target.directory, "research.md");
  return (
    existsSync(research) &&
    /^##\s+Open questions\s*$/imu.test(readFileSync(research, "utf8"))
  );
}

export function promptForStage(
  target: TaskTarget,
  stage: WorkflowStage,
): string {
  const skill = {
    research: "task-research",
    plan: "task-plan",
    implement: "task-implement",
    commit: "task-commit",
  }[stage];
  return `${target.fullName}: $${skill} ${pathToFileURL(target.taskFile).href}`;
}

export function agentStatePath(target: TaskTarget): string {
  return join(target.directory, ".agent.json");
}

export function readAgentState(target: TaskTarget): AgentState | undefined {
  const path = agentStatePath(target);
  if (!existsSync(path)) return undefined;
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!isAgentState(value) || value.taskId !== target.fullName) {
    throw new Error(`Invalid agent state: ${path}`);
  }
  return value;
}

export function writeAgentState(target: TaskTarget, state: AgentState): void {
  const path = agentStatePath(target);
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporary, path);
}

function isAgentState(value: unknown): value is AgentState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<AgentState>;
  return (
    state.version === 1 &&
    state.agent === "codex-acp" &&
    typeof state.sessionId === "string" && state.sessionId.length > 0 &&
    typeof state.cwd === "string" && isAbsolute(state.cwd) &&
    typeof state.taskId === "string" && state.taskId.length > 0 &&
    workflowStages.includes(state.lastCompletedStage as WorkflowStage)
  );
}

export function targetFromTaskFile(taskFile: string): TaskTarget {
  const directory = dirname(taskFile);
  const fullName = basename(directory);
  return {
    fullName,
    taskFile,
    directory,
  };
}
