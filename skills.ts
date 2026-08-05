import {
  lstatSync,
  mkdirSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const taskSkillNames = [
  "task-create",
  "task-research",
  "task-plan",
  "task-simple",
  "task-implement",
  "task-bugfix",
  "task-commit",
  "task-research-jira",
  "task-plan-jira",
  "task-simple-jira",
  "task-implement-jira",
  "task-bugfix-jira",
] as const;

export type SkillAction = "install" | "status" | "uninstall";

export type SkillServices = {
  home?: string;
  destinationRoot?: string;
  sourceRoot?: string;
  out: (message: string) => void;
  error: (message: string) => void;
};

function pathKind(path: string): "missing" | "symlink" | "other" {
  try {
    return lstatSync(path).isSymbolicLink() ? "symlink" : "other";
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return "missing";
    }
    throw error;
  }
}

function ownsLink(destination: string, source: string): boolean {
  if (pathKind(destination) !== "symlink") return false;
  const target = readlinkSync(destination);
  return resolve(dirname(destination), target) === resolve(source);
}

export function canonicalSkillsRoot(): string {
  return fileURLToPath(new URL("./skills", import.meta.url));
}

export function manageSkills(
  action: SkillAction,
  services: SkillServices,
): number {
  const sourceRoot = services.sourceRoot ?? canonicalSkillsRoot();
  const destinationRoot =
    services.destinationRoot ?? join(services.home ?? homedir(), ".agents", "skills");
  let conflicts = 0;
  let changes = 0;

  if (action === "install") mkdirSync(destinationRoot, { recursive: true });

  for (const name of taskSkillNames) {
    const source = join(sourceRoot, name);
    const destination = join(destinationRoot, name);
    const kind = pathKind(destination);

    if (action === "status") {
      if (ownsLink(destination, source)) services.out(`${name}: installed`);
      else if (kind === "missing") services.out(`${name}: not installed`);
      else {
        conflicts += 1;
        services.out(`${name}: conflict at ${destination}`);
      }
      continue;
    }

    if (action === "install") {
      if (ownsLink(destination, source)) {
        services.out(`${name}: already installed`);
      } else if (kind !== "missing") {
        conflicts += 1;
        services.error(`Refusing to replace ${destination}`);
      } else {
        symlinkSync(source, destination, "dir");
        changes += 1;
        services.out(`${name}: installed`);
      }
      continue;
    }

    if (ownsLink(destination, source)) {
      unlinkSync(destination);
      changes += 1;
      services.out(`${name}: uninstalled`);
    } else if (kind === "missing") {
      services.out(`${name}: not installed`);
    } else {
      conflicts += 1;
      services.error(`Refusing to remove unowned path ${destination}`);
    }
  }

  if (changes > 0) {
    services.out(`${action === "install" ? "Installed" : "Uninstalled"} ${changes} skill${changes === 1 ? "" : "s"}.`);
  }
  return conflicts === 0 ? 0 : 1;
}
