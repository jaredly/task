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
  out: (message: string) => void;
  error: (message: string) => void;
};

type TaskKind = "task" | "simple" | "bug";

const help = `Usage:
  task <name...>          Create a standard task
  task simple <name...>   Create a simple task
  task bug <name...>      Create a bug task
  task -p [target]        Print a task prompt, selecting a task if omitted
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

function inferTaskKind(fullName: string): TaskKind {
  const parts = fullName.split("-");
  const possibleKind =
    parts[0] === "bug" || parts[0] === "simple" ? parts[0] : parts[1];
  return possibleKind === "bug" || possibleKind === "simple"
    ? possibleKind
    : "task";
}

function defaultBrief(kind: TaskKind): string {
  return kind === "bug" ? "bug.md" : "task.md";
}

function promptFor(kind: TaskKind, fullName: string, taskFile: string): string {
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
): { fullName: string; taskFile: string } {
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

  return {
    fullName,
    taskFile: isMarkdown ? targetPath : join(taskDirectory, defaultBrief(kind)),
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

  const { fullName, taskFile } = resolvePromptTarget(
    selectedTarget,
    services.cwd,
    base,
  );
  services.out(promptFor(inferTaskKind(fullName), fullName, taskFile));
  return 0;
}

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
      if (args.length > 2) {
        services.error("task -p accepts at most one target");
        return 2;
      }
      return await printTaskPrompt(args[1], services, base);
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
    services.error(errorMessage(error));
    return 1;
  }
}
