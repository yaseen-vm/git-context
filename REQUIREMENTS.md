# git-context — Requirements

## Overview

**git-context** is a CLI tool that automatically gathers and structures repository context for AI-powered code reviews. It generates a structured, AI-ready context package from a Git repository so AI systems can produce more accurate, architecture-aware, and convention-compliant reviews.

---

## Problem

AI code review tools only see the diff. Developers spend 15–30 minutes manually collecting related files, architecture notes, coding conventions, historical commits, and dependency context before each review session. This process is slow, inconsistent, and error-prone.

---

## Goal

Reduce AI-review context preparation from 15–30 minutes to under 1 minute, while improving the quality and accuracy of AI-generated reviews by providing richer repository intelligence.

---

## Target Users

- Senior software engineers
- Platform and infrastructure teams
- Enterprise development teams
- Open source maintainers
- Engineering managers
- DevOps engineers using AI-assisted workflows

---

## Functional Requirements

### FR-1: Repository Change Analysis

The CLI must support analyzing changes from multiple sources:

| Command | Description |
|---|---|
| `git-context review --staged` | Analyze staged changes |
| `git-context review --unstaged` | Analyze working directory changes |
| `git-context review --commit <sha>` | Analyze a specific commit |
| `git-context review --branch <name>` | Analyze all commits on a branch vs. base |
| `git-context review --pr <number>` | Analyze a pull request diff |

### FR-2: Related File Discovery

Given a set of changed files, the tool must automatically discover related files including:

- Direct imports and dependencies
- Referenced types and interfaces
- Related services and modules
- Configuration files
- Test files corresponding to changed source files
- Shared utilities and middleware

### FR-3: Git History Intelligence

The tool must extract and summarize relevant Git history including:

- Recent commits touching changed files
- Author ownership per file/module
- Recurring change patterns
- Historical bug fixes and refactors relevant to changed code

### FR-4: Convention Extraction

The tool must detect and summarize team coding conventions by reading:

- `.editorconfig`
- ESLint and Prettier configuration files
- `tsconfig.json` / `jsconfig.json`
- `package.json` scripts and devDependencies
- CI pipeline configurations (GitHub Actions, GitLab CI, etc.)
- Test framework configuration

### FR-5: Architecture Understanding

The tool must analyze and summarize repository structure including:

- README files and inline documentation
- Folder structure and module boundaries
- Detected frameworks and architectural patterns (e.g., repository pattern, MVC, monorepo layout)
- Service relationships and dependency graphs

### FR-6: AI Prompt Generation

The tool must generate optimized, ready-to-use prompts for specific review types:

| Flag | Review Focus |
|---|---|
| `--security` | Security vulnerabilities and risks |
| `--performance` | Performance bottlenecks |
| `--architecture` | Structural and design concerns |
| `--bug` | Logic errors and edge cases |
| `--refactor` | Refactoring opportunities |

### FR-7: Output Formats

The tool must support multiple output formats:

- **Markdown** (default) — human-readable, pasteable into AI chat tools
- **JSON** — structured, for programmatic use and integrations
- **Prompt** — pre-formatted prompt text ready for AI tool input

### FR-8: Secret and Noise Filtering

The tool must automatically exclude sensitive and irrelevant content:

- `.env` files and any file matching secret patterns
- Generated files (build artifacts, compiled output)
- Lock files (`package-lock.json`, `yarn.lock`, etc.)
- Vendor directories
- Files matched by `.gitignore` and `.ignore`
- Binary files

### FR-9: Token Optimization

The generated context must be optimized to minimize unnecessary token usage:

- Prioritize high-signal files over low-signal ones
- Avoid duplicating content that appears in multiple related files
- Truncate large files to relevant sections
- Provide file summaries instead of full content where appropriate

### FR-10: Monorepo Support

The tool must correctly handle monorepo layouts by:

- Scoping analysis to the relevant package or workspace when possible
- Detecting monorepo tooling (Turborepo, Nx, Lerna, Yarn workspaces)
- Correctly resolving cross-package imports

---

## Non-Functional Requirements

### NFR-1: Performance

- Context generation must complete in under 10 seconds for typical repositories
- Must remain responsive on large monorepos (10,000+ files)
- Memory usage must remain reasonable for CI/CD environments

### NFR-2: Security

- The tool must operate fully offline with no mandatory source code upload
- No telemetry or data collection without explicit opt-in
- Secret detection must run before any output is written or transmitted

### NFR-3: Reliability

- Output must be deterministic given the same inputs
- The tool must degrade gracefully when optional data sources (e.g., PR API) are unavailable
- All CLI commands must exit with meaningful error codes

### NFR-4: Extensibility

- Support custom prompt templates via configuration file
- Support custom convention rules
- Plugin architecture for adding new analyzers

### NFR-5: Distribution

- Installable via `npm` / `npx`
- Installable via Homebrew (macOS/Linux)
- Single binary distribution for CI environments

---

## Technical Architecture

### Core Modules

| Module | Responsibility |
|---|---|
| **Git Engine** | Parse diffs, commits, blame, and branch history |
| **Dependency Analyzer** | Resolve imports, build module relationship graphs |
| **Convention Engine** | Extract lint rules, formatting standards, framework patterns |
| **Architecture Engine** | Analyze folder structure, README content, service layout |
| **Secret Filter** | Detect and redact sensitive content before output |
| **Prompt Builder** | Assemble final AI-ready output in target format |

### Recommended Tech Stack (MVP)

| Concern | Choice |
|---|---|
| Language | TypeScript |
| Git integration | `simple-git` |
| AST / import parsing | `ts-morph`, `tree-sitter` |
| File globbing | `glob` |
| CLI framework | `commander` |
| Ignore file handling | `ignore` |
| Distribution | npm, Homebrew |

---

## CLI Interface

### Basic Usage

```
git-context review [source] [options]
```

### Sources

```
--staged              Changed files in the Git index
--unstaged            Changed files in the working directory
--commit <sha>        A specific commit
--branch <name>       All commits on a branch vs. base branch
--pr <number>         A GitHub/GitLab pull request
```

### Options

```
--format <fmt>        Output format: markdown (default), json, prompt
--focus <type>        Review focus: security, performance, architecture, bug, refactor
--output <file>       Write output to a file instead of stdout
--max-tokens <n>      Target token budget for output
--no-history          Skip Git history analysis
--no-conventions      Skip convention extraction
--no-related          Skip related file discovery
--config <path>       Path to custom configuration file
```

### Example Output (Markdown)

```markdown
# Context for Authentication Refactor

## Changed Files
- src/auth/login.ts
- src/auth/types.ts

## Related Files
- src/auth/middleware.ts
- tests/auth/login.test.ts
- src/config/auth.ts

## Recent History
- Fix token validation — @alex (3 days ago)
- Add session refresh handling — @yaseen (2 weeks ago)

## Team Conventions
- Strict TypeScript mode enabled
- AppError required for all API errors
- Jest required for new modules

## Architecture Notes
- Auth module uses the repository pattern
- JWT stored in httpOnly cookies
- Session state managed via Redis
```

---

## Future Scope

The following are out of scope for MVP but represent planned expansion:

- **IDE integrations**: VS Code extension, Cursor plugin, JetBrains plugin
- **CI/CD integrations**: GitHub Actions, GitLab CI, Bitbucket Pipelines
- **Advanced intelligence**: PR intent detection, architecture drift detection, ownership mapping, semantic code understanding
- **Self-hosted API mode**: Expose context generation as an HTTP endpoint for team-wide use

---

## Success Metrics

| Metric | Target |
|---|---|
| Context preparation time | Under 1 minute (down from 15–30 min) |
| AI review accuracy improvement | Measurable reduction in hallucinations / missed conventions |
| CLI adoption | GitHub stars, npm weekly downloads |
| Enterprise usage | Team-level adoption and workflow integrations |
