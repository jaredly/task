# Research: Agent Thread Status Updates

## Current behavior

The repository distributes twelve workflow skills under `skills/`. `skills.ts` installs those directories verbatim into `~/.agents/skills`, so skill behavior is expressed by each `SKILL.md`; there is no shared skill runtime or status integration point to modify.

The local workflow has four explicit stages: research, plan, implement, and commit (`README.md`, “Codex ACP workflow”). The corresponding standard skills are `task-research`, `task-plan`, `task-implement`, and `task-commit`. The Jira variants follow the same first three stages, while Jira implementation, simple-task, and bugfix skills also own their commit work. `task-create` is intentionally a separate pre-workflow action.

No `update_thread_status` call or status-label convention exists in the repository. The tool is not available in the current harness, which confirms that the skill language must make the call conditional rather than rely on it at repository runtime.

`test/skills.test.ts` currently checks frontmatter and a small number of required workflow-boundary phrases. It does not assert a common instruction exists across skills.

## Proposed status contract

Add a compact conditional instruction near the start of every in-scope `SKILL.md`:

> If `update_thread_status(label, description)` is available in the current harness, call it to publish this skill’s current state. Leave `description` empty unless a short state-specific detail is useful.

Use the requested label pairs without spaces:

| Stage | In progress | Blocked | Completed | Skills |
| --- | --- | --- | --- | --- |
| Research | `📚🏃` | `📚🚫` | `📚✅` | `task-research`, `task-research-jira` |
| Plan | `📝🏃` | `📝🚫` | `📝✅` | `task-plan`, `task-plan-jira` |
| Implement | `👷🏃` | `👷🚫` | `👷✅` | `task-implement`, `task-simple`, `task-bugfix`, `task-implement-jira`, `task-simple-jira`, `task-bugfix-jira` |
| Commit | `👍🏃` | `👍🚫` | `👍✅` | `task-commit` |

Each skill should publish its in-progress label after it has resolved the task or ticket and before substantive work. It should publish the blocked label immediately before a genuine blocking stop, such as an ambiguous target, missing prerequisite artifact, unanswered decision, unreproducible bug, or failed required verification. It should publish completed only after its documented completion criteria are satisfied: for example, after `research.md` is written, a Jira comment is posted, implementation verification completes, or the scoped commit succeeds.

The conditional phrasing avoids treating a missing optional tool as an error and preserves compatibility with Codex, Zed, and other existing harnesses. Labels, rather than descriptions, carry the normal state, which matches the brief’s request for compact indicators and prevents noisy or inconsistent prose updates. Descriptions can be reserved for actual blockers, for example `Missing plan.md`.

## Feasible approaches

1. Add the full conditional lifecycle guidance to each in-scope skill. This is explicit at every call site and works with the existing verbatim installation model. It duplicates a small instruction block across eleven files.
2. Add a new shared status skill or repository-level instructions file and refer to it from each workflow skill. This would reduce duplication, but the current skills are designed to be independently installed and read; a new indirection could be unavailable in some harnesses and would require a distribution change.
3. Implement status tracking in the CLI’s ACP workflow (`agent.ts`/`workflow.ts`). This can report only CLI-owned sessions and cannot control direct skill invocations or Jira workflows. It does not satisfy the request to use a harness-provided tool from skills.

## Recommendation

Use approach 1. Update the eleven skills that map unambiguously to the supplied four stage labels, with the same conditional lifecycle rule and stage-specific label values. Keep the status tool out of TypeScript runtime code. Extend `test/skills.test.ts` with a data-driven assertion covering the intended files and their three labels, so future edits do not silently remove the integration language.

Do not set `🚫` for ordinary warnings, recoverable tool errors, or incomplete optional work. It should mean the skill cannot reliably continue and is stopping. Do not set `✅` when the skill has merely created an intermediate artifact but its own stated completion condition has not been met.

## Compatibility and migration

Existing installed copies are symlinks to the repository skill directories (`skills.ts`), so users with the standard installation receive the new text without a migration. A copied or independently packaged skill will need its normal refresh/reinstall process. Harnesses without the optional tool simply follow the existing workflow unchanged.

The repository uses ASCII in its source today, but the requested label protocol requires emoji. Those characters should be limited to the status instructions and tests that assert them. The label spelling and ordering should remain exact because another harness may use them for display or filtering.

## Open questions

1. Should `task-create` also publish a status? The supplied legend has no creation-stage emoji; the recommendation excludes it rather than inventing a fifth label.
    - exclude
2. Should blocked status be required before every intentional stop (including user-cancelled or scope-boundary stops), or only when user input/external state is genuinely needed? The recommendation uses the latter definition.
    - only when user input or assistance is needed
