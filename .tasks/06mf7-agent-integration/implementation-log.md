# Agent workflow integration implementation log

## Phase 1: Personal skills

- Added canonical `task-research`, `task-plan`, `task-implement`, `task-bugfix`, and `task-commit` skills under `skills/`, including generated Codex metadata.
- Added explicit, idempotent `task skills install|status|uninstall` symlink management with conflict protection.
- Added metadata, workflow-boundary, installer, conflict, and uninstall tests.

## Phase 2: Compact prompts

- Replaced long generated transcripts with one task-ID-prefixed `$task-*` invocation.
- Standardized brief arguments as encoded absolute `file:` URLs so paths containing spaces remain unambiguous.
- Updated creation and explicit/picker prompt tests.

## Phase 3: Workflow state

- Added task-kind stage ordering, conservative artifact recovery, open-question detection, explicit overrides, and validated atomic `.agent.json` persistence.
- Corrected an initial unsafe inference that treated `implementation-log.md` as proof implementation had completed; recovery now remains at `implement` until persisted success or a confirmed override.

## Phase 4: Codex ACP client

- Added pinned ACP SDK and Codex adapter runtime dependencies.
- Added an internal agent boundary and production client for initialize, create/resume/load/list, prompt streaming, permission selection, cancellation, normal-completion checks, and child cleanup.
- Session-history replay is suppressed from terminal output during discovery.

## Phase 5: CLI commands

- Added `task agent start|next|status`, task selection, exact task-ID session discovery, replay fallback, ambiguity handling, recovery confirmation, stage override, and confirmed `--new-session` replacement.
- Added fake-agent CLI coverage for success, resume, failure, recovery, open-question cancellation, overrides, replacement, status, and usage errors.

## Phase 6: Documentation and validation

- Documented skill installation, workflows, ACP behavior, permissions, cancellation, state recovery, Zed limitations, and Windows symlink constraints.
- `pnpm typecheck` passes.
- `pnpm test` passes with 40 tests.
- All five skills pass Codex's `quick_validate.py`.
- A read-only real-adapter smoke test initialized Codex ACP and listed three sessions for this repository; no prompt was sent.

## Issues and workarounds

- Codex's skill validator required PyYAML, which was absent. `uv` was used with a temporary cache; sandboxed network access required approval for the one-time dependency download.
- Raw absolute prompt paths were initially ambiguous when a repository path contained spaces. Encoded `file:` URLs fixed the bug.
- A direct CLI smoke test found that Node's strip-only TypeScript runtime rejects constructor parameter properties even though `tsc` and imported unit tests passed. The ACP client now uses a standard class field, and a spawned-entrypoint regression test covers the real execution mode.
- The first real ACP smoke test was blocked because the sandbox could not initialize Codex's SQLite state under `~/.codex`; the same read-only check passed with approved local-state access.
- Active injection into an already-open Zed thread is not supported by the current ACP ownership model and remains intentionally deferred. Prompt-sending ACP and Zed UI validation remain opt-in manual checks, not part of the default automated suite.

## Follow-up: skill-less prompt fallback

- Added `task -p --no-skill [target]` to preserve the original standard, simple, and bug prompt transcripts while keeping skill invocations as the default.
- The flag is order-independent with an explicit target and also works with the task picker. Unknown print options fail with usage exit code `2`.
