# AGENTS.md

## Status

Greenfield project — no source code, build system, or tests exist yet. Only `REQUIREMENTS.md` is present.

## Source of Truth

`REQUIREMENTS.md` contains the full product specification, CLI interface design, tech stack choices, and module architecture. Read it before writing any code.

## Planned Tech Stack

- TypeScript
- `simple-git` for git operations
- `ts-morph` / `tree-sitter` for AST parsing
- `commander` for CLI
- `glob` for file discovery
- `ignore` for .gitignore handling
- npm / Homebrew distribution
