import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  agentStatePath,
  hasOpenQuestions,
  inferStageFromArtifacts,
  initialStage,
  nextStage,
  promptForStage,
  readAgentState,
  targetFromTaskFile,
  writeAgentState,
} from "../workflow.ts";

function target(name = "06abc-work") {
  const root = mkdtempSync(join(tmpdir(), "tasks-workflow-"));
  const directory = join(root, ".tasks", name);
  mkdirSync(directory, { recursive: true });
  const brief = join(directory, name.includes("-bug-") ? "bug.md" : "task.md");
  writeFileSync(brief, "brief");
  return targetFromTaskFile(brief);
}

test("stage orders cover standard, simple, and bug tasks", () => {
  assert.equal(initialStage("task"), "research");
  assert.equal(nextStage("task", "research"), "plan");
  assert.equal(nextStage("task", "plan"), "implement");
  assert.equal(nextStage("task", "implement"), "commit");
  assert.equal(nextStage("task", "commit"), undefined);
  assert.equal(initialStage("simple"), "implement-and-commit");
  assert.equal(nextStage("simple", "implement-and-commit"), undefined);
  assert.equal(initialStage("bug"), "bugfix-and-commit");
});

test("artifact recovery proposes stages without claiming implementation completion", () => {
  const current = target();
  assert.equal(inferStageFromArtifacts(current), "research");
  writeFileSync(join(current.directory, "research.md"), "## Findings\n");
  assert.equal(inferStageFromArtifacts(current), "plan");
  writeFileSync(join(current.directory, "plan.md"), "# Plan\n");
  assert.equal(inferStageFromArtifacts(current), "implement");
  writeFileSync(join(current.directory, "implementation-log.md"), "started\n");
  assert.equal(inferStageFromArtifacts(current), "implement");
});

test("open questions and encoded skill prompts are detected", () => {
  const current = target("06abc-simple-work");
  writeFileSync(join(current.directory, "research.md"), "# Research\n\n## Open questions\n\nNone.\n");
  assert.equal(hasOpenQuestions(current), true);
  assert.match(promptForStage(current, "implement-and-commit"), /^06abc-simple-work: \$task-implement file:/u);
});

test("agent state round trips and rejects invalid stages", () => {
  const current = target();
  const state = { version: 1 as const, agent: "codex-acp" as const, sessionId: "session-1", cwd: "/repo", taskId: current.fullName, lastCompletedStage: "research" as const };
  writeAgentState(current, state);
  assert.deepEqual(readAgentState(current), state);
  assert.equal(JSON.parse(readFileSync(agentStatePath(current), "utf8")).sessionId, "session-1");
  writeFileSync(agentStatePath(current), JSON.stringify({ ...state, lastCompletedStage: "wat" }));
  assert.throws(() => readAgentState(current), /Invalid agent state/u);
});
