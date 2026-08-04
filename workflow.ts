import {
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";

export type TaskKind = "task" | "simple" | "bug";
export type WorkflowStage =
  | "research"
  | "plan"
  | "implement"
  | "commit"
  | "implement-and-commit"
  | "bugfix-and-commit";

export const workflowStages: readonly WorkflowStage[] = [
  "research",
  "plan",
  "implement",
  "commit",
  "implement-and-commit",
  "bugfix-and-commit",
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
  kind: TaskKind;
};

export function inferTaskKind(fullName: string): TaskKind {
  const parts = fullName.split("-");
  const possibleKind =
    parts[0] === "bug" || parts[0] === "simple" ? parts[0] : parts[1];
  return possibleKind === "bug" || possibleKind === "simple"
    ? possibleKind
    : "task";
}

export function defaultBrief(kind: TaskKind): string {
  return kind === "bug" ? "bug.md" : "task.md";
}

export function initialStage(kind: TaskKind): WorkflowStage {
  if (kind === "simple") return "implement-and-commit";
  if (kind === "bug") return "bugfix-and-commit";
  return "research";
}

export function nextStage(
  kind: TaskKind,
  lastCompletedStage?: WorkflowStage,
): WorkflowStage | undefined {
  if (!lastCompletedStage) return initialStage(kind);
  if (kind === "simple" || kind === "bug") return undefined;
  if (lastCompletedStage === "research") return "plan";
  if (lastCompletedStage === "plan") return "implement";
  if (lastCompletedStage === "implement") return "commit";
  return undefined;
}

export function inferStageFromArtifacts(target: TaskTarget): WorkflowStage | undefined {
  if (target.kind !== "task") return initialStage(target.kind);
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
    "implement-and-commit": "task-simple",
    "bugfix-and-commit": "task-bugfix",
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
    kind: inferTaskKind(fullName),
  };
}
