# AGENTS.md

## Rules

| Rule | Purpose |
| --- | --- |
| `./.agents/rules/coding-style.md` | Code style and formatting guidelines |
| `./.agents/rules/testing.md` | Testing requirements and coverage targets |
| `./.agents/rules/security.md` | Security checklist and best practices |
| `./.agents/rules/performance.md` | Performance guidelines |
| `./.agents/rules/git-workflow.md` | Git commit and PR workflow |
| `./.agents/rules/karpathy-guidelines.md` | Coding discipline: think before coding, simplicity, surgical changes |

## Toolchain

Bun runs the code and the tests, Biome owns formatting and linting, TypeScript owns types. Each
tool reads its boundary from a committed file, and `bun run verify` fails when they disagree.

| Command | Runs |
| --- | --- |
| `bun run check` | the gate: Biome, `bun check`, then tests |
| `bun run fix` | Biome formatting, lint fixes, and import sorting |
| `bun run verify` | toolchain symmetry check |
| `bun test` | tests; `bun test --coverage` enforces the 80% floor from `testing.md` |

Never add a second formatter (`bun fmt`, Prettier, ESLint, oxlint). `bun run verify` rejects it.
`bun check` runs the `check` script when one exists, so call `bun check --no-script` for the raw
type checker.

