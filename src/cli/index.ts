import { Command } from 'commander';
import { VERSION } from '../index.js';

export function createCLI(): Command {
  const program = new Command();

  program
    .name('git-context')
    .description(
      'CLI tool that gathers and structures repository context for AI-powered code reviews',
    )
    .version(VERSION);

  program
    .command('review')
    .description('Analyze repository changes and generate AI-ready context')
    .option('--staged', 'Analyze staged changes')
    .option('--unstaged', 'Analyze working directory changes')
    .option('--commit <sha>', 'Analyze a specific commit')
    .option('--branch <name>', 'Analyze all commits on a branch vs. base')
    .option('--pr <number>', 'Analyze a pull request diff')
    .option('--format <fmt>', 'Output format: markdown, json, prompt', 'markdown')
    .option('--focus <type>', 'Review focus: security, performance, architecture, bug, refactor')
    .option('--output <file>', 'Write output to a file instead of stdout')
    .option('--max-tokens <n>', 'Target token budget for output')
    .option('--no-history', 'Skip Git history analysis')
    .option('--no-conventions', 'Skip convention extraction')
    .option('--no-related', 'Skip related file discovery')
    .option('--config <path>', 'Path to custom configuration file')
    .action(async (options) => {
      try {
        const { reviewCommand } = await import('./commands/review.js');
        await reviewCommand(options);
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  return program;
}
