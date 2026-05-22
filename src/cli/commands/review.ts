import { GitEngine, GitDiff } from '../../git-engine/index.js';
import { PromptBuilder, PromptBuilderOptions } from '../../prompt-builder/index.js';
import {
  OutputFormat,
  ReviewFocus,
  ReviewContext,
  SUPPORTED_FORMATS,
  REVIEW_FOCUSES,
} from '../../utils/index.js';

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
    throw new Error('Not a git repository');
  }

  const source = determineSource(options);
  if (!source) {
    throw new Error(
      'Please specify a source: --staged, --unstaged, --commit <sha>, --branch <name>, or --pr <number>',
    );
  }

  const format = validateFormat(options.format);
  const focus = options.focus ? validateFocus(options.focus) : undefined;

  const result = await getDiff(gitEngine, source);

  const context = await buildReviewContext(gitEngine, result, options);

  const promptBuilderOptions: PromptBuilderOptions = {
    format,
    focus,
    maxTokens: options.maxTokens ? parseInt(options.maxTokens, 10) : undefined,
  };

  const promptBuilder = new PromptBuilder(promptBuilderOptions);
  const promptResult = await promptBuilder.buildPrompt(context);

  if (options.output) {
    const fs = await import('fs');
    fs.writeFileSync(options.output, promptResult.content, 'utf-8');
    console.log(`Output written to ${options.output}`);
  } else {
    console.log(promptResult.content);
  }

  console.error(`\nFormat: ${promptResult.format}`);
  console.error(`Estimated tokens: ${promptResult.tokenEstimate}`);
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

function determineSource(options: ReviewOptions): { type: string; value: string } | null {
  if (options.staged) return { type: 'staged', value: 'index' };
  if (options.unstaged) return { type: 'unstaged', value: 'working-directory' };
  if (options.commit) return { type: 'commit', value: options.commit };
  if (options.branch) return { type: 'branch', value: options.branch };
  if (options.pr) return { type: 'pr', value: options.pr };
  return null;
}

function validateFormat(format?: string): OutputFormat {
  if (!format) return 'markdown';
  if (!SUPPORTED_FORMATS.includes(format as OutputFormat)) {
    throw new Error(
      `Invalid format: ${format}. Supported formats: ${SUPPORTED_FORMATS.join(', ')}`,
    );
  }
  return format as OutputFormat;
}

function validateFocus(focus: string): ReviewFocus {
  if (!REVIEW_FOCUSES.includes(focus as ReviewFocus)) {
    throw new Error(`Invalid focus: ${focus}. Supported focuses: ${REVIEW_FOCUSES.join(', ')}`);
  }
  return focus as ReviewFocus;
}

async function buildReviewContext(
  gitEngine: GitEngine,
  result: DiffResult,
  options: ReviewOptions,
): Promise<ReviewContext> {
  const changes = result.diff.files.map((file) => ({
    path: file.path,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
  }));

  const relatedFiles: string[] = [];

  if (options.history !== false) {
    const history = [];
    for (const file of result.diff.files.slice(0, 5)) {
      const commits = await gitEngine.getRecentCommits(file.path, 3);
      history.push(...commits);
    }

    return {
      changes,
      relatedFiles,
      history,
      conventions: {},
      architecture: { structure: [], frameworks: [], patterns: [] },
    };
  }

  return {
    changes,
    relatedFiles,
    history: [],
    conventions: {},
    architecture: { structure: [], frameworks: [], patterns: [] },
  };
}
