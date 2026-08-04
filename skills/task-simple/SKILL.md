---
name: task-simple
description: Implement, verify, log, and commit a compact simple task described by task.md. Use for simple-kind .tasks workflows that intentionally skip research and planning.
---

# Task Simple

1. Resolve the task from the supplied `task.md` or task directory, or infer a unique task ID/link from the earliest relevant user message. Ask for a path when ambiguous.
2. Confirm this is a simple task from its `-simple-` directory name. Read the brief, repository instructions, relevant code and tests, and working-tree status.
3. Do not require, create, or backfill `research.md` or `plan.md`. A simple task starts directly from its brief. Ask only questions that block a safe implementation; otherwise proceed.
4. Implement the narrowest coherent change using repository patterns. Preserve unrelated working-tree changes and avoid opportunistic refactors.
5. Create or update `implementation-log.md` beside the brief. Record the change, verification, issues, and workarounds concisely.
6. Add risk-appropriate tests and run relevant verification. Do not declare completion while required behavior is unverified or tests are failing.
7. Review the final diff, stage only simple-task-related files, and create a detailed commit. Ask before staging when unrelated work overlaps the same files or scope is ambiguous.

Completion requires the requested behavior, passing relevant verification, an accurate `implementation-log.md`, and a scoped commit. Research and planning artifacts are not prerequisites.
