import simpleGit, { SimpleGit } from 'simple-git';
import parseDiff from 'parse-diff';
import { PRAnalyzer, PRInfo } from './pr-analyzer.js';

export interface GitDiff {
  files: DiffFile[];
  stats: {
    insertions: number;
    deletions: number;
    filesChanged: number;
  };
}

export interface DiffFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  diff: string;
}

export interface GitCommit {
  hash: string;
  date: string;
  message: string;
  author: string;
  email: string;
}

export class GitEngine {
  private git: SimpleGit;
  private repoPath: string;
  private prAnalyzer: PRAnalyzer;

  constructor(repoPath: string = process.cwd()) {
    this.repoPath = repoPath;
    this.git = simpleGit(repoPath);
    this.prAnalyzer = new PRAnalyzer();
  }

  async isRepository(): Promise<boolean> {
    try {
      await this.git.status();
      return true;
    } catch {
      return false;
    }
  }

  async getStagedDiff(): Promise<GitDiff> {
    const diff = await this.git.diff(['--cached', '--stat']);
    const diffDetail = await this.git.diff(['--cached']);
    const files = await this.parseDiff(diffDetail);
    const stats = this.parseDiffStats(diff);
    return { files, stats };
  }

  async getUnstagedDiff(): Promise<GitDiff> {
    const diff = await this.git.diff(['--stat']);
    const diffDetail = await this.git.diff([]);
    const files = await this.parseDiff(diffDetail);
    const stats = this.parseDiffStats(diff);
    return { files, stats };
  }

  async getCommitDiff(sha: string): Promise<GitDiff> {
    const diff = await this.git.diff([`${sha}~1..${sha}`, '--stat']);
    const diffDetail = await this.git.diff([`${sha}~1..${sha}`]);
    const files = await this.parseDiff(diffDetail);
    const stats = this.parseDiffStats(diff);
    return { files, stats };
  }

  async getBranchDiff(branch: string, base?: string): Promise<GitDiff> {
    const baseBranch = base || (await this.getDefaultBranch());
    const diff = await this.git.diff([`${baseBranch}..${branch}`, '--stat']);
    const diffDetail = await this.git.diff([`${baseBranch}..${branch}`]);
    const files = await this.parseDiff(diffDetail);
    const stats = this.parseDiffStats(diff);
    return { files, stats };
  }

  async getDefaultBranch(): Promise<string> {
    try {
      // Try to get the default branch from origin/HEAD
      const result = await this.git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD', '--short']);
      if (result) {
        return result.trim().replace('origin/', '');
      }
    } catch {
      // Ignore error
    }

    try {
      // Try to get the default branch from remote
      const remotes = await this.git.getRemotes(true);
      const origin = remotes.find((r) => r.name === 'origin');
      if (origin?.refs?.fetch) {
        // Check if main or master branch exists
        const branches = await this.git.branch(['-r']);
        if (branches.all.includes('origin/main')) {
          return 'main';
        }
        if (branches.all.includes('origin/master')) {
          return 'master';
        }
      }
    } catch {
      // Ignore error
    }

    // Default to 'main' as it's the modern default
    return 'main';
  }

  async getPRDiff(prNumber: number): Promise<{ prInfo: PRInfo; diff: GitDiff }> {
    const prInfo = await this.prAnalyzer.fetchPR(prNumber);
    const files = await this.parseDiff(prInfo.diff);
    const stats = this.parseDiffStatsFromFiles(files);
    return { prInfo, diff: { files, stats } };
  }

  async getRecentCommits(filePath?: string, count: number = 10): Promise<GitCommit[]> {
    const logOptions: Record<string, string> = {
      maxCount: String(count),
    };
    if (filePath) {
      logOptions.file = filePath;
    }
    const log = await this.git.log(logOptions);
    return log.all.map((commit) => ({
      hash: commit.hash,
      date: commit.date,
      message: commit.message,
      author: commit.author_name,
      email: commit.author_email,
    }));
  }

  async getFileContent(filePath: string): Promise<string> {
    try {
      return await this.git.show([`HEAD:${filePath}`]);
    } catch {
      throw new Error(`File not found in repository: ${filePath}`);
    }
  }

  async getFileBlame(filePath: string): Promise<string> {
    return await this.git.raw(['blame', filePath]);
  }

  async getRemoteUrl(): Promise<string | null> {
    try {
      const remotes = await this.git.getRemotes(true);
      const origin = remotes.find((r) => r.name === 'origin');
      return origin?.refs?.fetch || null;
    } catch {
      return null;
    }
  }

  async isPRAnalysisAvailable(): Promise<boolean> {
    return this.prAnalyzer.isAvailable();
  }

  async detectRemoteProvider(): Promise<string | null> {
    const remote = await this.prAnalyzer.detectRemote();
    return remote?.provider || null;
  }

  private parseDiffStats(diffStat: string): {
    insertions: number;
    deletions: number;
    filesChanged: number;
  } {
    const lines = diffStat.split('\n');
    const lastLine = lines[lines.length - 1] || '';
    const match = lastLine.match(
      /(\d+) files? changed(?:, (\d+) insertions?)?(?:, (\d+) deletions?)?/,
    );
    if (match) {
      return {
        filesChanged: parseInt(match[1], 10),
        insertions: parseInt(match[2] || '0', 10),
        deletions: parseInt(match[3] || '0', 10),
      };
    }
    return { insertions: 0, deletions: 0, filesChanged: 0 };
  }

  private parseDiffStatsFromFiles(files: DiffFile[]): {
    insertions: number;
    deletions: number;
    filesChanged: number;
  } {
    let insertions = 0;
    let deletions = 0;
    for (const file of files) {
      insertions += file.additions;
      deletions += file.deletions;
    }
    return {
      filesChanged: files.length,
      insertions,
      deletions,
    };
  }

  private async parseDiff(diffDetail: string): Promise<DiffFile[]> {
    const files: DiffFile[] = [];

    try {
      const parsedFiles = parseDiff(diffDetail);

      for (const file of parsedFiles) {
        const filePath = file.to || file.from || '';
        let status: DiffFile['status'] = 'modified';

        if (file.new) {
          status = 'added';
        } else if (file.deleted) {
          status = 'deleted';
        } else if (file.rename) {
          status = 'renamed';
        }

        let additions = 0;
        let deletions = 0;

        for (const chunk of file.chunks) {
          for (const change of chunk.changes) {
            if (change.type === 'add') {
              additions++;
            } else if (change.type === 'del') {
              deletions++;
            }
          }
        }

        files.push({
          path: filePath,
          status,
          additions,
          deletions,
          diff: diffDetail,
        });
      }
    } catch {
      // Fallback to simple parsing if parse-diff fails
      const chunks = diffDetail.split(/^diff --git /m).filter(Boolean);

      for (const chunk of chunks) {
        const lines = chunk.split('\n');
        const headerLine = lines[0] || '';
        const pathMatch = headerLine.match(/a\/(.+) b\/(.+)/);
        if (!pathMatch) continue;

        const filePath = pathMatch[2];
        let status: DiffFile['status'] = 'modified';
        let additions = 0;
        let deletions = 0;

        for (const line of lines) {
          if (line.startsWith('new file')) status = 'added';
          else if (line.startsWith('deleted file')) status = 'deleted';
          else if (line.startsWith('rename from')) status = 'renamed';
          else if (line.startsWith('+') && !line.startsWith('+++')) additions++;
          else if (line.startsWith('-') && !line.startsWith('---')) deletions++;
        }

        files.push({
          path: filePath,
          status,
          additions,
          deletions,
          diff: chunk,
        });
      }
    }

    return files;
  }
}

export { PRAnalyzer, PRInfo } from './pr-analyzer.js';
