import { GitEngine, GitDiff } from '../../git-engine/index.js';

export interface ReviewOptions {
  staged?: boolean;
  unstaged?: boolean;
  commit?: string;
  branch?: string;
  pr?: string;
  format?: string;
  focus?: string;
  output?: string;
  maxTokens?: string;
  history?: boolean;
  conventions?: boolean;
  related?: boolean;
  config?: string;
}

export async function reviewCommand(options: ReviewOptions): Promise<void> {
  const gitEngine = new GitEngine();

  const isRepo = await gitEngine.isRepository();
  if (!isRepo) {
    console.error('Error: Not a git repository');
    process.exit(1);
  }

  const source = determineSource(options);
  if (!source) {
    console.error(
      'Error: Please specify a source: --staged, --unstaged, --commit <sha>, --branch <name>, or --pr <number>',
    );
    process.exit(1);
  }

  console.log(`Analyzing ${source.type}: ${source.value}`);
  console.log(`Format: ${options.format}`);
  if (options.focus) console.log(`Focus: ${options.focus}`);
  console.log('');

  try {
    const result = await getDiff(gitEngine, source);

    if (result.prInfo) {
      console.log(`PR #${result.prInfo.number}: ${result.prInfo.title}`);
      console.log(`Author: ${result.prInfo.author}`);
      console.log(`Base: ${result.prInfo.baseBranch} <- Head: ${result.prInfo.headBranch}`);
      if (result.prInfo.description) {
        console.log(`\nDescription:\n${result.prInfo.description}`);
      }
      console.log('');
    }

    displayDiff(result.diff);

    if (options.history !== false) {
      await displayHistory(gitEngine, result.diff);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

interface DiffResult {
  diff: GitDiff;
  prInfo?: {
    number: number;
    title: string;
    author: string;
    baseBranch: string;
    headBranch: string;
    description: string;
  };
}

async function getDiff(
  gitEngine: GitEngine,
  source: { type: string; value: string },
): Promise<DiffResult> {
  switch (source.type) {
    case 'staged':
      return { diff: await gitEngine.getStagedDiff() };
    case 'unstaged':
      return { diff: await gitEngine.getUnstagedDiff() };
    case 'commit':
      return { diff: await gitEngine.getCommitDiff(source.value) };
    case 'branch':
      return { diff: await gitEngine.getBranchDiff(source.value) };
    case 'pr': {
      const prNumber = parseInt(source.value, 10);
      if (isNaN(prNumber)) {
        throw new Error(`Invalid PR number: ${source.value}`);
      }
      const { prInfo, diff } = await gitEngine.getPRDiff(prNumber);
      return {
        diff,
        prInfo: {
          number: prInfo.number,
          title: prInfo.title,
          author: prInfo.author,
          baseBranch: prInfo.baseBranch,
          headBranch: prInfo.headBranch,
          description: prInfo.description,
        },
      };
    }
    default:
      throw new Error(`Unknown source type: ${source.type}`);
  }
}

function displayDiff(diff: GitDiff): void {
  console.log(`Files changed: ${diff.stats.filesChanged}`);
  console.log(`Insertions: +${diff.stats.insertions}`);
  console.log(`Deletions: -${diff.stats.deletions}`);
  console.log('');

  for (const file of diff.files) {
    const statusIcon = getStatusIcon(file.status);
    console.log(`${statusIcon} ${file.path} (+${file.additions}, -${file.deletions})`);
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'added':
      return '[+]';
    case 'modified':
      return '[M]';
    case 'deleted':
      return '[-]';
    case 'renamed':
      return '[R]';
    default:
      return '[?]';
  }
}

async function displayHistory(gitEngine: GitEngine, diff: GitDiff): Promise<void> {
  console.log('\nRecent commits:');

  for (const file of diff.files.slice(0, 5)) {
    const commits = await gitEngine.getRecentCommits(file.path, 3);
    if (commits.length > 0) {
      console.log(`\n${file.path}:`);
      for (const commit of commits) {
        console.log(`  ${commit.hash.slice(0, 7)} ${commit.message} (${commit.author})`);
      }
    }
  }
}

function determineSource(options: ReviewOptions): { type: string; value: string } | null {
  if (options.staged) return { type: 'staged', value: 'index' };
  if (options.unstaged) return { type: 'unstaged', value: 'working-directory' };
  if (options.commit) return { type: 'commit', value: options.commit };
  if (options.branch) return { type: 'branch', value: options.branch };
  if (options.pr) return { type: 'pr', value: options.pr };
  return null;
}
