# git-context

CLI tool that gathers and structures repository context for AI-powered code reviews. Generates a structured, AI-ready context package so AI systems can produce more accurate, architecture-aware, convention-compliant reviews.

## Problem

AI code review tools only see the diff. Developers spend 15–30 minutes manually collecting related files, architecture notes, coding conventions, historical commits, and dependency context before each review session.

**git-context reduces that to under 1 minute.**

## Installation

### npm / npx

```bash
# Install globally
npm install -g git-context

# Or run without installing
npx git-context review --staged
```

### Homebrew (macOS / Linux)

```bash
brew tap yaseen-vm/git-context
brew install git-context
```

### Download binary

Pre-built binaries for Linux, macOS (Intel + Apple Silicon), and Windows are available on the [releases page](https://github.com/yaseen-vm/git-context/releases).

```bash
# macOS (Apple Silicon)
curl -L https://github.com/yaseen-vm/git-context/releases/latest/download/git-context-macos-arm64 -o /usr/local/bin/git-context
chmod +x /usr/local/bin/git-context

# macOS (Intel)
curl -L https://github.com/yaseen-vm/git-context/releases/latest/download/git-context-macos-x64 -o /usr/local/bin/git-context
chmod +x /usr/local/bin/git-context

# Linux
curl -L https://github.com/yaseen-vm/git-context/releases/latest/download/git-context-linux-x64 -o /usr/local/bin/git-context
chmod +x /usr/local/bin/git-context
```

## Usage

```bash
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

### Examples

```bash
# Review staged changes
git-context review --staged

# Review a branch with security focus
git-context review --branch feature/auth --focus security

# Review a PR and output JSON
git-context review --pr 42 --format json

# Write context to a file
git-context review --staged --output context.md
```

## Requirements

- Node.js >= 20 (for npm installation)
- `gh` CLI (for `--pr` with GitHub) or `glab` CLI (for GitLab)

## License

MIT
