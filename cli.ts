import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { pathToFileURL } from "node:url";

import type { AgentSessionInfo, TaskAgent } from "./agent.ts";
import { manageSkills, type SkillAction } from "./skills.ts";
import {
  defaultBrief,
  hasOpenQuestions,
  inferStageFromArtifacts,
  inferTaskKind,
  initialStage,
  nextStage,
  promptForStage,
  readAgentState,
  targetFromTaskFile,
  writeAgentState,
  workflowStages,
  type TaskKind,
  type TaskTarget,
  type WorkflowStage,
} from "./workflow.ts";

export type Choice = {
  name: string;
  value: string;
  description?: string;
};

export type CliServices = {
  cwd: string;
  now: Date;
  version: string;
  editFile: (filename: string) => Promise<void>;
  rename: (source: string, destination: string) => void;
  chooseOne: (message: string, choices: Choice[]) => Promise<string>;
  chooseMany: (message: string, choices: Choice[]) => Promise<string[]>;
  confirm: (message: string) => Promise<boolean>;
  agent?: TaskAgent;
  homeDir?: string;
  skillsRoot?: string;
  out: (message: string) => void;
  error: (message: string) => void;
};

const help = `Usage:
  task <name...>          Create a standard task
  task simple <name...>   Create a simple task
  task bug <name...>      Create a bug task
  task -p [--no-skill] [target]
                         Print a task prompt, selecting a task if omitted
  task skills <action>    Install, inspect, or uninstall personal skills
  task agent <action>     Start, advance, or inspect a Codex ACP workflow
  task -a                 Select completed tasks to archive
  task -h, --help         Show this help
  task --version          Show the version`;

export function findTasksBase(cwd: string): string | undefined {
  let current = resolve(cwd);

  while (true) {
    const candidate = join(current, ".tasks");
    if (existsSync(candidate) && statSync(candidate).isDirectory()) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

export function normalizeTaskName(parts: string[]): string {
  return parts
    .join("-")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function taskPrefix(now: Date): string {
  const epoch = new Date(2026, 0, 1).getTime();
  const minutes = Math.floor((now.getTime() - epoch) / 60_000);
  const maxMinutes = Math.floor(
    (new Date(2100, 0, 1).getTime() - epoch) / 60_000,
  );
  return minutes.toString(36).padStart(maxMinutes.toString(36).length, "0");
}

function promptFor(kind: TaskKind, fullName: string, taskFile: string): string {
  return promptForStage(
    {
      ...targetFromTaskFile(taskFile),
      fullName,
      kind,
    },
    initialStage(kind),
  );
}

function skilllessPromptFor(
  kind: TaskKind,
  fullName: string,
  taskFile: string,
): string {
  const taskName = basename(taskFile);
  const link = `[@${taskName}](${pathToFileURL(taskFile).href})`;

  if (kind === "bug") {
    return `${fullName}: can you look at ${link} and create a failing repro test? If you get stuck, stop and ask for more information, but otherwise you can proceed with a fix. Keep a concise log of what you've done in implementation-log.md.`;
  }

  if (kind === "simple") {
    return [
      `${fullName}: can you look at ${link} and let me know if you have any questions?`,
      "",
      "Go ahead and implement, and keep a concise log of what you've done in implementation-log.md. Be sure to make note of any issues, workarounds, or bugs encountered.",
    ].join("\n");
  }

  return [
    `${fullName}: can you look at ${link} and write up a research.md, including any open questions?`,
    "",
    "I've answered the open questions inline.",
    "Can you write up a plan.md detailing what needs to be done? Split it up into logical phases if helpful.",
    "",
    "Ok, go ahead and implement phase by phase, keeping a concise log of your progress in implementation-log.md. Be sure to call out any issues, workarounds or bugs encountered.",
    "",
    "Can you make a commit with a detailed message describing the work done?",
  ].join("\n");
}

function resolvePromptTarget(
  target: string,
  cwd: string,
  base: string | undefined,
): TaskTarget {
  const isMarkdown = target.endsWith(".md");
  const isPath =
    isAbsolute(target) ||
    target.startsWith(".") ||
    target.includes("/") ||
    target.includes("\\");
  const targetPath = isPath || isMarkdown
    ? resolve(cwd, target)
    : base
      ? join(base, ".tasks", target)
      : resolve(cwd, target);
  const taskDirectory = isMarkdown ? dirname(targetPath) : targetPath;
  const fullName = basename(taskDirectory);
  const kind = inferTaskKind(fullName);

  const taskFile = isMarkdown ? targetPath : join(taskDirectory, defaultBrief(kind));
  return {
    fullName,
    taskFile,
    directory: dirname(taskFile),
    kind,
  };
}

async function createTask(
  args: string[],
  services: CliServices,
  base: string | undefined,
): Promise<number> {
  if (!base) {
    services.error("Unable to find a .tasks directory");
    return 1;
  }

  const kind: TaskKind =
    args[0] === "bug" ? "bug" : args[0] === "simple" ? "simple" : "task";
  const nameParts = kind === "task" ? args : args.slice(1);
  const taskName = normalizeTaskName(nameParts);
  if (!taskName) {
    services.error("A task name is required. Run task -h for usage.");
    return 2;
  }

  const fullName = `${taskPrefix(services.now)}-${kind === "task" ? "" : `${kind}-`}${taskName}`;
  const directory = join(base, ".tasks", fullName);
  if (existsSync(directory)) {
    services.error(`Task already exists: ${directory}`);
    return 1;
  }

  const brief = join(directory, defaultBrief(kind));
  const subdirectory = relative(base, services.cwd);
  mkdirSync(directory);
  writeFileSync(brief, subdirectory ? `${subdirectory}: ` : "");

  try {
    await services.editFile(brief);
  } catch (error) {
    services.error(
      `Task created at ${directory}, but the editor failed: ${errorMessage(error)}`,
    );
    return 1;
  }

  services.out(promptFor(kind, fullName, brief));
  return 0;
}

function activeTaskChoices(base: string): Choice[] {
  const tasks = join(base, ".tasks");
  return readdirSync(tasks, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        entry.name !== "000-archive" &&
        !entry.name.startsWith("."),
    )
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left))
    .map((name) => ({ name, value: name }));
}

async function printTaskPrompt(
  target: string | undefined,
  useSkills: boolean,
  services: CliServices,
  base: string | undefined,
): Promise<number> {
  let selectedTarget = target;
  if (!selectedTarget) {
    if (!base) {
      services.error("Unable to find a .tasks directory for task selection");
      return 1;
    }
    const choices = activeTaskChoices(base);
    if (choices.length === 0) {
      services.out("No active tasks found.");
      return 0;
    }
    selectedTarget = await services.chooseOne("Select a task to continue", choices);
  }

  const { fullName, taskFile, kind } = resolvePromptTarget(
    selectedTarget,
    services.cwd,
    base,
  );
  services.out(
    useSkills
      ? promptFor(kind, fullName, taskFile)
      : skilllessPromptFor(kind, fullName, taskFile),
  );
  return 0;
}

function parsePrintArguments(args: string[]): {
  target?: string;
  useSkills: boolean;
} {
  let target: string | undefined;
  let useSkills = true;
  for (const argument of args) {
    if (argument === "--no-skill") {
      useSkills = false;
    } else if (argument.startsWith("-")) {
      throw new UsageError(`Unknown task -p option: ${argument}`);
    } else if (!target) {
      target = argument;
    } else {
      throw new UsageError("task -p accepts at most one target");
    }
  }
  return { target, useSkills };
}

async function selectTaskTarget(
  target: string | undefined,
  services: CliServices,
  base: string | undefined,
): Promise<TaskTarget | undefined> {
  let selected = target;
  if (!selected) {
    if (!base) throw new Error("Unable to find a .tasks directory for task selection");
    const choices = activeTaskChoices(base);
    if (choices.length === 0) {
      services.out("No active tasks found.");
      return undefined;
    }
    selected = await services.chooseOne("Select a task", choices);
  }
  const resolved = resolvePromptTarget(selected, services.cwd, base);
  if (!existsSync(resolved.taskFile)) {
    throw new Error(`Task brief not found: ${resolved.taskFile}`);
  }
  return resolved;
}

function parseAgentArguments(args: string[]): {
  action: "start" | "next" | "status";
  target?: string;
  stage?: WorkflowStage;
  newSession: boolean;
} {
  const action = args[0];
  if (action !== "start" && action !== "next" && action !== "status") {
    throw new UsageError("task agent requires start, next, or status");
  }
  let target: string | undefined;
  let stage: WorkflowStage | undefined;
  let newSession = false;
  for (let index = 1; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--stage") {
      const candidate = args[index + 1] as WorkflowStage | undefined;
      if (!candidate || !workflowStages.includes(candidate)) {
        throw new UsageError(`Invalid workflow stage: ${candidate ?? "missing"}`);
      }
      stage = candidate;
      index += 1;
    } else if (value === "--new-session") {
      newSession = true;
    } else if (!target) {
      target = value;
    } else {
      throw new UsageError("task agent accepts at most one target");
    }
  }
  if (action === "status" && stage) {
    throw new UsageError("task agent status does not accept --stage");
  }
  if (newSession && action !== "start") {
    throw new UsageError("--new-session is only valid with task agent start");
  }
  return { action, target, stage, newSession };
}

async function discoverSession(
  agent: TaskAgent,
  target: TaskTarget,
  cwd: string,
  services: CliServices,
): Promise<string | undefined> {
  const sessions = await agent.listSessions(cwd);
  let matches = sessions.filter((session) =>
    containsTaskId(session.title, target.fullName),
  );
  if (matches.length === 0) {
    const replayMatches: AgentSessionInfo[] = [];
    for (const session of sessions) {
      const first = await agent.firstUserMessage(session.sessionId, cwd);
      if (containsTaskId(first, target.fullName)) replayMatches.push(session);
    }
    matches = replayMatches;
  }
  if (matches.length === 0) return undefined;
  if (matches.length === 1) return matches[0].sessionId;
  return await services.chooseOne(
    `Select the Codex session for ${target.fullName}`,
    matches.map((session) => ({
      name: session.title || session.sessionId,
      value: session.sessionId,
      description: session.updatedAt ?? undefined,
    })),
  );
}

function containsTaskId(value: string | null | undefined, taskId: string): boolean {
  if (!value) return false;
  const index = value.indexOf(taskId);
  if (index < 0) return false;
  const boundary = (character: string | undefined) =>
    character === undefined || !/[A-Za-z0-9_-]/u.test(character);
  return boundary(value[index - 1]) && boundary(value[index + taskId.length]);
}

async function runAgentCommand(
  args: string[],
  services: CliServices,
  base: string | undefined,
): Promise<number> {
  const parsed = parseAgentArguments(args);
  const target = await selectTaskTarget(parsed.target, services, base);
  if (!target) return 0;
  const state = readAgentState(target);

  if (parsed.action === "status") {
    const inferred = state
      ? nextStage(target.kind, state.lastCompletedStage)
      : inferStageFromArtifacts(target);
    services.out(
      state
        ? `Session: ${state.sessionId}\nLast completed: ${state.lastCompletedStage}\nNext: ${inferred ?? "complete"}`
        : `No saved agent session.\nInferred next stage: ${inferred ?? "complete"}`,
    );
    return 0;
  }

  if (!services.agent) {
    services.error("Codex ACP support is unavailable in this CLI environment");
    return 1;
  }
  if (parsed.action === "start" && state && !parsed.newSession) {
    services.error(`Task already has an agent session: ${state.sessionId}`);
    return 1;
  }
  if (parsed.action === "start" && state && parsed.newSession) {
    if (!(await services.confirm(`Replace agent session ${state.sessionId} with a new session?`))) {
      services.out("Cancelled.");
      return 0;
    }
  }

  let sessionId = parsed.newSession ? undefined : state?.sessionId;
  let stage = parsed.action === "start"
    ? initialStage(target.kind)
    : state
      ? nextStage(target.kind, state.lastCompletedStage)
      : inferStageFromArtifacts(target);

  if (parsed.stage && parsed.stage !== stage) {
    if (!(await services.confirm(`Override inferred stage ${stage ?? "complete"} with ${parsed.stage}?`))) {
      services.out("Cancelled.");
      return 0;
    }
    stage = parsed.stage;
  }
  if (!stage) {
    services.out("Workflow is complete.");
    return 0;
  }

  if (!state && parsed.action === "next") {
    sessionId = await discoverSession(services.agent, target, base ?? services.cwd, services);
    const message = sessionId
      ? `Resume Codex session ${sessionId} outside Zed at inferred stage ${stage}?`
      : `No matching session was found. Create one at inferred stage ${stage}?`;
    if (!(await services.confirm(message))) {
      services.out("Cancelled.");
      return 0;
    }
  }
  if (stage === "plan" && hasOpenQuestions(target)) {
    if (!(await services.confirm("Research contains an Open questions section. Were all questions answered or intentionally left open?"))) {
      services.out("Planning cancelled.");
      return 0;
    }
  }

  services.out(`Starting ${stage} for ${target.fullName}...`);
  const result = await services.agent.runTurn({
    cwd: base ?? services.cwd,
    prompt: promptForStage(target, stage),
    sessionId,
  });
  writeAgentState(target, {
    version: 1,
    agent: "codex-acp",
    sessionId: result.sessionId,
    cwd: base ?? services.cwd,
    taskId: target.fullName,
    lastCompletedStage: stage,
  });
  services.out(`Completed ${stage}.`);
  return 0;
}

class UsageError extends Error {}

export function formatAge(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

type ArchiveCandidate = {
  name: string;
  modifiedAt: number;
};

function archiveCandidates(base: string): ArchiveCandidate[] {
  const tasks = join(base, ".tasks");
  return readdirSync(tasks, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && entry.name !== "000-archive",
    )
    .flatMap((entry) => {
      const log = join(tasks, entry.name, "implementation-log.md");
      return existsSync(log)
        ? [{ name: entry.name, modifiedAt: statSync(log).mtimeMs }]
        : [];
    })
    .sort(
      (left, right) =>
        left.modifiedAt - right.modifiedAt || left.name.localeCompare(right.name),
    );
}

function isDirectChild(parent: string, name: string): boolean {
  return (
    name !== "." &&
    name !== ".." &&
    !name.includes("/") &&
    !name.includes("\\") &&
    basename(name) === name &&
    dirname(resolve(parent, name)) === resolve(parent)
  );
}

async function archiveTasks(
  services: CliServices,
  base: string | undefined,
): Promise<number> {
  if (!base) {
    services.error("Unable to find a .tasks directory");
    return 1;
  }

  const tasks = join(base, ".tasks");
  const candidates = archiveCandidates(base);
  if (candidates.length === 0) {
    services.out("No tasks with implementation-log.md found.");
    return 0;
  }

  const selected = await services.chooseMany(
    "Select tasks to archive",
    candidates.map((candidate) => ({
      name: `${candidate.name} (log updated ${formatAge(services.now.getTime() - candidate.modifiedAt)})`,
      value: candidate.name,
    })),
  );
  if (selected.length === 0) {
    services.out("No tasks selected.");
    return 0;
  }
  if (new Set(selected).size !== selected.length) {
    throw new Error("A task was selected more than once");
  }

  const archive = join(tasks, "000-archive");
  const moves = selected.map((name) => {
    if (!isDirectChild(tasks, name)) {
      throw new Error(`Invalid task name selected: ${name}`);
    }
    const source = join(tasks, name);
    const destination = join(archive, name);
    if (
      !existsSync(source) ||
      !existsSync(join(source, "implementation-log.md"))
    ) {
      throw new Error(`Archive source is no longer eligible: ${source}`);
    }
    if (existsSync(destination)) {
      throw new Error(`Archive destination already exists: ${destination}`);
    }
    return { name, source, destination };
  });

  services.out(
    `Selected for archive:\n${moves.map((move) => `  ${move.name}`).join("\n")}`,
  );
  if (
    !(await services.confirm(
      `Archive ${moves.length} task${moves.length === 1 ? "" : "s"}?`,
    ))
  ) {
    services.out("Archive cancelled.");
    return 0;
  }

  if (!existsSync(archive)) {
    mkdirSync(archive);
  }

  const completed: typeof moves = [];
  try {
    for (const move of moves) {
      services.rename(move.source, move.destination);
      completed.push(move);
    }
  } catch (error) {
    const rollbackFailures: string[] = [];
    for (const move of completed.reverse()) {
      try {
        services.rename(move.destination, move.source);
      } catch (rollbackError) {
        rollbackFailures.push(`${move.name}: ${errorMessage(rollbackError)}`);
      }
    }
    services.error(`Archive failed: ${errorMessage(error)}`);
    if (rollbackFailures.length > 0) {
      services.error(`Rollback also failed:\n${rollbackFailures.join("\n")}`);
    } else if (completed.length > 0) {
      services.error("Completed moves were rolled back.");
    }
    return 1;
  }

  services.out(`Archived ${moves.length} task${moves.length === 1 ? "" : "s"}.`);
  return 0;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runCli(
  args: string[],
  services: CliServices,
): Promise<number> {
  try {
    if (args.length === 0) {
      services.error(help);
      return 2;
    }
    if (args[0] === "-h" || args[0] === "--help") {
      services.out(help);
      return 0;
    }
    if (args[0] === "--version") {
      services.out(services.version);
      return 0;
    }

    const base = findTasksBase(services.cwd);
    if (args[0] === "-p") {
      const parsed = parsePrintArguments(args.slice(1));
      return await printTaskPrompt(
        parsed.target,
        parsed.useSkills,
        services,
        base,
      );
    }
    if (args[0] === "-a") {
      if (args.length > 1) {
        services.error(
          "task -a is now interactive; -f and -c are no longer supported.",
        );
        return 2;
      }
      return await archiveTasks(services, base);
    }
    if (args[0] === "skills") {
      if (
        args.length !== 2 ||
        !["install", "status", "uninstall"].includes(args[1])
      ) {
        services.error("Usage: task skills <install|status|uninstall>");
        return 2;
      }
      return manageSkills(args[1] as SkillAction, {
        home: services.homeDir,
        sourceRoot: services.skillsRoot,
        out: services.out,
        error: services.error,
      });
    }
    if (args[0] === "agent") {
      return await runAgentCommand(args.slice(1), services, base);
    }
    if (args[0].startsWith("-")) {
      services.error(`Unknown option: ${args[0]}. Run task -h for usage.`);
      return 2;
    }

    return await createTask(args, services, base);
  } catch (error) {
    if (error instanceof Error && error.name === "ExitPromptError") {
      services.out("Cancelled.");
      return 0;
    }
    if (error instanceof UsageError) {
      services.error(error.message);
      return 2;
    }
    services.error(errorMessage(error));
    return 1;
  }
}
