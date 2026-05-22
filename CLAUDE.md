# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`git-context` is a CLI tool that gathers and structures repository context for AI-powered code reviews. It outputs an AI-ready context package (related files, git history, conventions, architecture) so AI systems can produce more accurate, convention-aware reviews.

The source of truth for intended behavior is **REQUIREMENTS.md**. All module responsibilities, CLI interface, and output formats are specified there. **AGENTS.md** has additional developer notes.

## Commands

```bash
npm run build         # Compile TypeScript → dist/
npm run dev           # Watch mode
npm run typecheck     # Type-check without emitting
npm run lint          # ESLint on src/
npm run lint:fix      # ESLint auto-fix
npm run format        # Prettier on src/
npm run format:check  # Prettier validation (no writes)
npm run test          # Vitest interactive
npm run test:run      # Vitest single run (CI)
```

CI runs `lint → typecheck → test:run → build` on Node 18, 20, and 22 against pushes/PRs to `master`.

## Architecture

The pipeline flows: **Git Engine → Dependency Analyzer → Convention Engine → Architecture Engine → Secret Filter → Prompt Builder → CLI output**

All modules live under `src/` and are currently stubs (`export {}`). The CLI entry is `src/cli.ts` (shebang, commander-based); the library entry is `src/index.ts` (exports `VERSION`).

| Module | Path | Responsibility |
|---|---|---|
| Git Engine | `src/git-engine/` | Parse diffs, commits, blame, branch history via `simple-git` |
| Dependency Analyzer | `src/dependency-analyzer/` | Resolve imports, build module graph via `ts-morph` / `tree-sitter` |
| Convention Engine | `src/convention-engine/` | Extract lint rules, formatting standards, framework patterns |
| Architecture Engine | `src/architecture-engine/` | Analyze folder structure, README, service layout |
| Secret Filter | `src/secret-filter/` | Detect and redact sensitive content before output |
| Prompt Builder | `src/prompt-builder/` | Assemble final AI-ready output |
| CLI | `src/cli/` | Command parsing via `commander` |
| Utils | `src/utils/` | Shared helpers |

Integration tests go in `tests/integration/`. The project is ES Module (`"type": "module"` in package.json), targeting ES2022, strict TypeScript. Path alias `@/*` maps to `src/*`.

## Planned Dependencies (not yet installed)

`simple-git`, `ts-morph`, `tree-sitter`, `commander`, `glob`, `ignore` — see REQUIREMENTS.md for rationale.
