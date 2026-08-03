import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  findTasksBase,
  formatAge,
  normalizeTaskName,
  runCli,
  type Choice,
  type CliServices,
} from "../cli.ts";

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "tasks-test-"));
  mkdirSync(join(root, ".tasks"));
  return root;
}

function harness(
  cwd: string,
  overrides: Partial<CliServices> = {},
): { services: CliServices; output: string[]; errors: string[] } {
  const output: string[] = [];
  const errors: string[] = [];
  const services: CliServices = {
    cwd,
    now: new Date(2026, 7, 3, 12, 0, 0),
    version: "1.0.0",
    editFile: async () => {},
    rename: renameSync,
    chooseOne: async (_message: string, choices: Choice[]) => choices[0].value,
    chooseMany: async () => [],
    confirm: async () => false,
    out: (message) => output.push(message),
    error: (message) => errors.push(message),
    ...overrides,
  };
  return { services, output, errors };
}

test("findTasksBase searches parents", () => {
  const root = fixture();
  const nested = join(root, "src", "feature");
  mkdirSync(nested, { recursive: true });
  assert.equal(findTasksBase(nested), root);
  assert.equal(findTasksBase(tmpdir()), undefined);
});

test("findTasksBase ignores a regular file named .tasks", () => {
  const root = mkdtempSync(join(tmpdir(), "tasks-file-"));
  writeFileSync(join(root, ".tasks"), "not a directory");
  assert.equal(findTasksBase(root), undefined);
});

test("normalizeTaskName replaces unsafe characters", () => {
  assert.equal(normalizeTaskName(["hello", "world"]), "hello-world");
  assert.equal(normalizeTaskName(["hello / shell;$world"]), "hello-shell-world");
  assert.equal(normalizeTaskName(["---"]), "");
});

test("help and invalid input do not create tasks", async () => {
  const root = fixture();
  const initialMtime = statSync(join(root, ".tasks")).mtimeMs;

  const noArgs = harness(root);
  assert.equal(await runCli([], noArgs.services), 2);
  assert.match(noArgs.errors[0], /Usage:/);

  const help = harness(root);
  assert.equal(await runCli(["-h"], help.services), 0);
  assert.match(help.output[0], /task -a/);

  const unknown = harness(root);
  assert.equal(await runCli(["--wat"], unknown.services), 2);
  assert.equal(statSync(join(root, ".tasks")).mtimeMs, initialMtime);
});

test("creates each task kind and includes nested context", async () => {
  const root = fixture();
  const nested = join(root, "src", "feature");
  mkdirSync(nested, { recursive: true });

  for (const [args, marker, briefName] of [
    [["standard", "work"], "-standard-work", "task.md"],
    [["simple", "small", "work"], "-simple-small-work", "task.md"],
    [["bug", "broken", "flow"], "-bug-broken-flow", "bug.md"],
  ] as const) {
    let edited = "";
    const current = harness(nested, {
      editFile: async (filename) => {
        edited = filename;
      },
    });
    assert.equal(await runCli([...args], current.services), 0);
    assert.match(edited, new RegExp(`${marker.replaceAll("-", "\\-")}/${briefName}$`));
    assert.equal(readFileSync(edited, "utf8"), "src/feature: ");
    assert.match(current.output[0], new RegExp(`^\\w+${marker}:`));
  }
});

test("editor failure preserves the task and reports its path", async () => {
  const root = fixture();
  const current = harness(root, {
    editFile: async () => {
      throw new Error("no editor");
    },
  });

  assert.equal(await runCli(["unfinished"], current.services), 1);
  assert.match(current.errors[0], /Task created at .*editor failed: no editor/);
  const taskName = current.errors[0].match(/\.tasks\/(\S+),/)?.[1];
  assert.ok(taskName);
  assert.equal(readFileSync(join(root, ".tasks", taskName, "task.md"), "utf8"), "");
});

test("same timestamp and name reports a collision", async () => {
  const root = fixture();
  const first = harness(root);
  const second = harness(root);
  assert.equal(await runCli(["duplicate"], first.services), 0);
  assert.equal(await runCli(["duplicate"], second.services), 1);
  assert.match(second.errors[0], /Task already exists/);
});

test("creation normalizes punctuation and encodes paths in prompt URLs", async () => {
  const root = mkdtempSync(join(tmpdir(), "tasks test-"));
  mkdirSync(join(root, ".tasks"));
  const current = harness(root);

  assert.equal(await runCli(["path/to", "shell;$name"], current.services), 0);
  assert.match(current.output[0], /-path-to-shell-name:/);
  assert.match(current.output[0], /file:\/\/.*tasks%20test-/);
  assert.doesNotMatch(current.output[0], /shell;\$name/);
});

test("explicit prompt targets are permissive and preserve Markdown names", async () => {
  const root = fixture();

  const bare = harness(root);
  assert.equal(await runCli(["-p", "06abc-bug-missing"], bare.services), 0);
  assert.match(bare.output[0], /^06abc-bug-missing:/);
  assert.match(bare.output[0], /create a failing repro test/);
  assert.match(bare.output[0], /\.tasks\/06abc-bug-missing\/bug\.md/);

  const markdown = harness(root);
  assert.equal(await runCli(["-p", "brief.md"], markdown.services), 0);
  assert.match(markdown.output[0], /^tasks-test-[^:]+:/);
  assert.match(markdown.output[0], /@brief\.md/);
  assert.match(markdown.output[0], /tasks-test-[^/]+\/brief\.md/);

  const outside = mkdtempSync(join(tmpdir(), "tasks-outside-"));
  const arbitrary = harness(outside);
  assert.equal(await runCli(["-p", "not-created"], arbitrary.services), 0);
  assert.match(arbitrary.output[0], /not-created\/task\.md/);
});

test("explicit prompt accepts archived and relative directory paths", async () => {
  const root = fixture();
  const archived = join(root, ".tasks", "000-archive", "06abc-simple-old");
  mkdirSync(archived, { recursive: true });
  const current = harness(root);

  assert.equal(
    await runCli(["-p", ".tasks/000-archive/06abc-simple-old"], current.services),
    0,
  );
  assert.match(current.output[0], /let me know if you have any questions/);
  assert.match(current.output[0], /000-archive\/06abc-simple-old\/task\.md/);
});

test("prompt selection lists active tasks newest first", async () => {
  const root = fixture();
  mkdirSync(join(root, ".tasks", "06aaa-old"));
  mkdirSync(join(root, ".tasks", "06azz-bug-new"));
  mkdirSync(join(root, ".tasks", "000-archive", "06zzz-archived"), {
    recursive: true,
  });
  let offered: Choice[] = [];
  const current = harness(root, {
    chooseOne: async (_message, choices) => {
      offered = choices;
      return choices[0].value;
    },
  });

  assert.equal(await runCli(["-p"], current.services), 0);
  assert.deepEqual(
    offered.map((choice) => choice.value),
    ["06azz-bug-new", "06aaa-old"],
  );
  assert.match(current.output[0], /^06azz-bug-new:/);
});

test("empty and cancelled prompt selections are clean no-ops", async () => {
  const root = fixture();
  const empty = harness(root);
  assert.equal(await runCli(["-p"], empty.services), 0);
  assert.deepEqual(empty.output, ["No active tasks found."]);

  mkdirSync(join(root, ".tasks", "06abc-active"));
  const cancelled = harness(root, {
    chooseOne: async () => {
      const error = new Error("cancelled");
      error.name = "ExitPromptError";
      throw error;
    },
  });
  assert.equal(await runCli(["-p"], cancelled.services), 0);
  assert.deepEqual(cancelled.output, ["Cancelled."]);
});

test("prompt selection requires a repository and rejects extra targets", async () => {
  const outside = mkdtempSync(join(tmpdir(), "tasks-outside-"));
  const noRepository = harness(outside);
  assert.equal(await runCli(["-p"], noRepository.services), 1);
  assert.match(noRepository.errors[0], /Unable to find/);

  const extra = harness(outside);
  assert.equal(await runCli(["-p", "one", "two"], extra.services), 2);
  assert.match(extra.errors[0], /at most one target/);
});

function archiveTask(root: string, name: string, modifiedAt: Date): string {
  const directory = join(root, ".tasks", name);
  mkdirSync(directory, { recursive: true });
  const log = join(directory, "implementation-log.md");
  writeFileSync(log, "done");
  utimesSync(log, modifiedAt, modifiedAt);
  return directory;
}

test("formatAge uses stable human-readable units", () => {
  assert.equal(formatAge(30_000), "just now");
  assert.equal(formatAge(18 * 60_000), "18m ago");
  assert.equal(formatAge(6 * 60 * 60_000), "6h ago");
  assert.equal(formatAge(12 * 24 * 60 * 60_000), "12d ago");
  assert.equal(formatAge(90 * 24 * 60 * 60_000), "3mo ago");
});

test("archive offers oldest logs first with age labels", async () => {
  const root = fixture();
  archiveTask(root, "06new-newer", new Date(2026, 7, 3, 10, 0));
  archiveTask(root, "06old-older", new Date(2026, 6, 20, 12, 0));
  mkdirSync(join(root, ".tasks", "06active-no-log"));
  archiveTask(
    root,
    "000-archive/06archived-old",
    new Date(2026, 0, 1),
  );
  let offered: Choice[] = [];
  const current = harness(root, {
    chooseMany: async (_message, choices) => {
      offered = choices;
      return [];
    },
  });

  assert.equal(await runCli(["-a"], current.services), 0);
  assert.deepEqual(
    offered.map((choice) => choice.value),
    ["06old-older", "06new-newer"],
  );
  assert.match(offered[0].name, /14d ago/);
  assert.deepEqual(current.output, ["No tasks selected."]);
});

test("archive cancellation does not create the archive directory", async () => {
  const root = fixture();
  archiveTask(root, "06abc-finished", new Date(2026, 7, 1));
  const current = harness(root, {
    chooseMany: async (_message, choices) => [choices[0].value],
    confirm: async () => false,
  });

  assert.equal(await runCli(["-a"], current.services), 0);
  assert.equal(existsSync(join(root, ".tasks", "000-archive")), false);
  assert.equal(existsSync(join(root, ".tasks", "06abc-finished")), true);
  assert.match(current.output.at(-1) ?? "", /cancelled/i);
});

test("archive moves confirmed selections", async () => {
  const root = fixture();
  archiveTask(root, "06abc-finished", new Date(2026, 7, 1));
  const current = harness(root, {
    chooseMany: async (_message, choices) => [choices[0].value],
    confirm: async () => true,
  });

  assert.equal(await runCli(["-a"], current.services), 0);
  assert.equal(existsSync(join(root, ".tasks", "06abc-finished")), false);
  assert.equal(
    existsSync(join(root, ".tasks", "000-archive", "06abc-finished")),
    true,
  );
  assert.match(current.output.at(-1) ?? "", /Archived 1 task/);
});

test("archive rejects traversal and stale selections before confirmation", async () => {
  const root = fixture();
  const directory = archiveTask(
    root,
    "06abc-finished",
    new Date(2026, 7, 1),
  );
  let confirmed = false;
  const traversal = harness(root, {
    chooseMany: async () => ["../outside"],
    confirm: async () => {
      confirmed = true;
      return true;
    },
  });
  assert.equal(await runCli(["-a"], traversal.services), 1);
  assert.match(traversal.errors[0], /Invalid task name/);
  assert.equal(confirmed, false);

  const stale = harness(root, {
    chooseMany: async () => {
      unlinkSync(join(directory, "implementation-log.md"));
      return ["06abc-finished"];
    },
    confirm: async () => {
      confirmed = true;
      return true;
    },
  });
  assert.equal(await runCli(["-a"], stale.services), 1);
  assert.match(stale.errors[0], /no longer eligible/);
  assert.equal(confirmed, false);
});

test("archive preflights destination conflicts", async () => {
  const root = fixture();
  archiveTask(root, "06abc-finished", new Date(2026, 7, 1));
  mkdirSync(join(root, ".tasks", "000-archive", "06abc-finished"), {
    recursive: true,
  });
  const current = harness(root, {
    chooseMany: async (_message, choices) => [choices[0].value],
  });

  assert.equal(await runCli(["-a"], current.services), 1);
  assert.match(current.errors[0], /destination already exists/);
  assert.equal(existsSync(join(root, ".tasks", "06abc-finished")), true);
});

test("archive rolls back completed moves after a later failure", async () => {
  const root = fixture();
  archiveTask(root, "06aaa-first", new Date(2026, 7, 1));
  archiveTask(root, "06aab-second", new Date(2026, 7, 2));
  let forwardMoves = 0;
  const current = harness(root, {
    chooseMany: async (_message, choices) => choices.map((choice) => choice.value),
    confirm: async () => true,
    rename: (source, destination) => {
      if (destination.includes("000-archive")) {
        forwardMoves += 1;
        if (forwardMoves === 2) throw new Error("simulated move failure");
      }
      renameSync(source, destination);
    },
  });

  assert.equal(await runCli(["-a"], current.services), 1);
  assert.equal(existsSync(join(root, ".tasks", "06aaa-first")), true);
  assert.equal(existsSync(join(root, ".tasks", "06aab-second")), true);
  assert.match(current.errors.join("\n"), /rolled back/);
});

test("archive reports empty candidates and rejects legacy flags", async () => {
  const root = fixture();
  const empty = harness(root);
  assert.equal(await runCli(["-a"], empty.services), 0);
  assert.deepEqual(empty.output, ["No tasks with implementation-log.md found."]);

  const legacy = harness(root);
  assert.equal(await runCli(["-a", "-f"], legacy.services), 2);
  assert.match(legacy.errors[0], /now interactive/);
});
