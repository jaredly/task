import assert from "node:assert/strict";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { manageSkills, taskSkillNames } from "../skills.ts";

const sourceRoot = resolve("skills");

const statusSkillLabels = [
  { name: "task-research", labels: ["📚🏃", "📚🚫", "📚✅"] },
  { name: "task-research-jira", labels: ["📚🏃", "📚🚫", "📚✅"] },
  { name: "task-plan", labels: ["📝🏃", "📝🚫", "📝✅"] },
  { name: "task-plan-jira", labels: ["📝🏃", "📝🚫", "📝✅"] },
  { name: "task-implement", labels: ["👷🏃", "👷🚫", "👷✅"] },
  { name: "task-simple", labels: ["👷🏃", "👷🚫", "👍✅"] },
  { name: "task-bugfix", labels: ["👷🏃", "👷🚫", "👷✅"] },
  { name: "task-implement-jira", labels: ["👷🏃", "👷🚫", "👷✅"] },
  { name: "task-simple-jira", labels: ["👷🏃", "👷🚫", "👷✅"] },
  { name: "task-bugfix-jira", labels: ["👷🏃", "👷🚫", "👷✅"] },
  { name: "task-commit", labels: ["👍🏃", "👍🚫", "👍✅"] },
];

test("canonical skills have unique valid metadata and workflow boundaries", () => {
  const names = new Set<string>();
  for (const expectedName of taskSkillNames) {
    const content = readFileSync(join(sourceRoot, expectedName, "SKILL.md"), "utf8");
    const metadata = content.match(/^---\nname: ([^\n]+)\ndescription: ([^\n]+)\n---/u);
    assert.ok(metadata, `${expectedName} has valid frontmatter`);
    assert.equal(metadata[1], expectedName);
    assert.ok(metadata[2].trim());
    assert.ok(!names.has(metadata[1]));
    names.add(metadata[1]);
  }

  const create = readFileSync(join(sourceRoot, "task-create", "SKILL.md"), "utf8");
  assert.match(create, /task -n <descriptive name>/u);
  assert.match(create, /Do not create `research\.md`, `plan\.md`, or `implementation-log\.md`/u);
  assert.match(create, /do not investigate, edit product code, run implementation tests, or commit/u);

  assert.match(readFileSync(join(sourceRoot, "task-research", "SKILL.md"), "utf8"), /research\.md[\s\S]*Do not write `plan\.md`/u);
  assert.match(readFileSync(join(sourceRoot, "task-plan", "SKILL.md"), "utf8"), /Open questions[\s\S]*plan\.md/u);
  assert.match(readFileSync(join(sourceRoot, "task-implement", "SKILL.md"), "utf8"), /plan\.md[\s\S]*Do not commit/u);
  assert.match(readFileSync(join(sourceRoot, "task-simple", "SKILL.md"), "utf8"), /Do not require, create, or backfill `research\.md` or `plan\.md`/u);
  assert.match(readFileSync(join(sourceRoot, "task-simple", "SKILL.md"), "utf8"), /scoped commit/u);
  assert.match(readFileSync(join(sourceRoot, "task-bugfix", "SKILL.md"), "utf8"), /failing reproduction[\s\S]*scoped commit/u);

  assert.match(readFileSync(join(sourceRoot, "task-research-jira", "SKILL.md"), "utf8"), /## Research note[\s\S]*Do not post a plan/u);
  assert.match(readFileSync(join(sourceRoot, "task-plan-jira", "SKILL.md"), "utf8"), /## Research note[\s\S]*## Implementation plan/u);
  for (const name of ["task-implement-jira", "task-simple-jira", "task-bugfix-jira"]) {
    const content = readFileSync(join(sourceRoot, name, "SKILL.md"), "utf8");
    assert.match(content, /\*\*draft\*\* pull request/u, `${name} opens a draft pull request`);
    assert.match(content, /## Implementation log/u, `${name} posts an implementation log comment`);
    assert.match(content, /No separate commit stage follows this skill/u, `${name} owns its commit`);
  }

  for (const { name, labels } of statusSkillLabels) {
    const content = readFileSync(join(sourceRoot, name, "SKILL.md"), "utf8");
    assert.match(content, /If `update_thread_status` is available/u, `${name} makes status updates conditional`);
    assert.match(content, /operation: "set"/u, `${name} uses the update_thread_status set operation`);
    for (const label of labels) {
      assert.match(content, new RegExp(label, "u"), `${name} contains status label ${label}`);
    }
  }
});

test("skill installation is idempotent and uninstall removes only owned links", () => {
  const home = mkdtempSync(join(tmpdir(), "tasks-skills-home-"));
  const output: string[] = [];
  const errors: string[] = [];
  const services = { home, sourceRoot, out: (line: string) => output.push(line), error: (line: string) => errors.push(line) };

  assert.equal(manageSkills("install", services), 0);
  assert.equal(manageSkills("install", services), 0);
  for (const name of taskSkillNames) {
    const destination = join(home, ".agents", "skills", name);
    assert.ok(lstatSync(destination).isSymbolicLink());
    assert.equal(resolve(join(destination, ".."), readlinkSync(destination)), join(sourceRoot, name));
  }
  assert.equal(manageSkills("status", services), 0);
  assert.equal(manageSkills("uninstall", services), 0);
  assert.equal(errors.length, 0);
});

test("skill installation refuses conflicts", () => {
  const home = mkdtempSync(join(tmpdir(), "tasks-skills-conflict-"));
  const destination = join(home, ".agents", "skills", taskSkillNames[0]);
  mkdirSync(destination, { recursive: true });
  writeFileSync(join(destination, "owned-by-user"), "keep");
  const errors: string[] = [];

  assert.equal(manageSkills("install", { home, sourceRoot, out: () => {}, error: (line) => errors.push(line) }), 1);
  assert.equal(readFileSync(join(destination, "owned-by-user"), "utf8"), "keep");
  assert.match(errors[0], /Refusing to replace/u);
});
