## Change

- Added `--local` support to `task skills <install|status|uninstall>`.
- Local skill commands target `.agents/skills` under the nearest `.tasks` root, falling back to the current directory when no task root is found.
- Added CLI tests for project-local install behavior and invalid skills options.
- Documented local skill installation in the README and command summary.

## Verification

- `npm run test -- test/cli.test.ts test/skills.test.ts`
- `npm run typecheck`

## Issues

- The repository already had unrelated modified skill files and a modified `test/skills.test.ts`; they were left untouched.
