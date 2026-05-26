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

  private validateSha(sha: string, paramName: string = 'SHA'): void {
    if (!sha || typeof sha !== 'string') {
      throw new Error(`${paramName} must be a non-empty string`);
    }
    const trimmed = sha.trim();
    if (!/^[0-9a-f]{4,40}$/i.test(trimmed)) {
      throw new Error(
        `${paramName} must be a valid git commit hash (4-40 hex characters), got: "${trimmed}"`,
      );
    }
  }

  private validateBranchName(branch: string, paramName: string = 'branch'): void {
    if (!branch || typeof branch !== 'string') {
      throw new Error(`${paramName} must be a non-empty string`);
    }
    const trimmed = branch.trim();
    if (trimmed.length === 0) {
      throw new Error(`${paramName} must not be empty`);
    }
    if (trimmed.includes('..')) {
      throw new Error(`${paramName} must not contain ".." range syntax`);
    }
    if (/[~^:?*\\]/.test(trimmed)) {
      throw new Error(`${paramName} contains invalid git characters`);
    }
    // Check for control characters (0x00-0x1F and 0x7F)
    for (let i = 0; i < trimmed.length; i++) {
      const code = trimmed.charCodeAt(i);
      if (code < 0x20 || code === 0x7f) {
        throw new Error(`${paramName} contains control characters`);
      }
    }
  }

  private validateFilePath(filePath: string, paramName: string = 'filePath'): void {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error(`${paramName} must be a non-empty string`);
    }
    const trimmed = filePath.trim();
    if (trimmed.includes('\0')) {
      throw new Error(`${paramName} contains null byte`);
    }
    if (trimmed.includes('..')) {
      throw new Error(`${paramName} must not contain path traversal ("..")`);
    }
  }

  private validateCount(count: number, paramName: string = 'count'): void {
    if (!Number.isInteger(count) || count < 1) {
      throw new Error(`${paramName} must be a positive integer, got: ${count}`);
    }
    if (count > 1000) {
      throw new Error(`${paramName} must not exceed 1000, got: ${count}`);
    }
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
    this.validateSha(sha);
    const safeSha = sha.trim();
    const diff = await this.git.diff([`${safeSha}~1..${safeSha}`, '--stat']);
    const diffDetail = await this.git.diff([`${safeSha}~1..${safeSha}`]);
    const files = await this.parseDiff(diffDetail);
    const stats = this.parseDiffStats(diff);
    return { files, stats };
  }

  async getBranchDiff(branch: string, base?: string): Promise<GitDiff> {
    this.validateBranchName(branch);
    if (base !== undefined) {
      this.validateBranchName(base, 'base branch');
    }
    const baseBranch = base || (await this.getDefaultBranch());
    const safeBranch = branch.trim();
    const diff = await this.git.diff([`${baseBranch}..${safeBranch}`, '--stat']);
    const diffDetail = await this.git.diff([`${baseBranch}..${safeBranch}`]);
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
    if (!Number.isInteger(prNumber) || prNumber < 1) {
      throw new Error(`PR number must be a positive integer, got: ${prNumber}`);
    }
    const prInfo = await this.prAnalyzer.fetchPR(prNumber);
    const files = await this.parseDiff(prInfo.diff);
    const stats = this.parseDiffStatsFromFiles(files);
    return { prInfo, diff: { files, stats } };
  }

  async getRecentCommits(filePath?: string, count: number = 10): Promise<GitCommit[]> {
    if (filePath !== undefined) {
      this.validateFilePath(filePath);
    }
    this.validateCount(count);
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
    this.validateFilePath(filePath);
    try {
      return await this.git.show([`HEAD:${filePath}`]);
    } catch {
      throw new Error(`File not found in repository: ${filePath}`);
    }
  }

  async getFileBlame(filePath: string): Promise<string> {
    this.validateFilePath(filePath);
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

  private buildPerFileDiffMap(diffDetail: string): Map<string, string> {
    const map = new Map<string, string>();
    const sections = diffDetail.split(/^(?=diff --git )/m).filter(Boolean);
    for (const section of sections) {
      const match = section.match(/^diff --git a\/.+ b\/(.+)/m);
      if (match) {
        map.set(match[1].trim(), section);
      }
    }
    return map;
  }

  private async parseDiff(diffDetail: string): Promise<DiffFile[]> {
    const files: DiffFile[] = [];
    const perFileDiffMap = this.buildPerFileDiffMap(diffDetail);

    try {
      const parsedFiles = parseDiff(diffDetail);

      for (const file of parsedFiles) {
        const filePath = file.to || file.from || '';
        let status: DiffFile['status'] = 'modified';

        if (file.new) {
          status = 'added';
        } else if (file.deleted) {
          status = 'deleted';
        } else if (file.from && file.to && file.from !== file.to) {
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
          diff: perFileDiffMap.get(filePath) ?? diffDetail,
        });
      }
    } catch {
      // Fallback to simple parsing if parse-diff fails
      const chunks = diffDetail.split(/^(?=diff --git )/m).filter(Boolean);

      for (const chunk of chunks) {
        const lines = chunk.split('\n');
        const headerLine = lines[0] || '';
        const pathMatch = headerLine.match(/diff --git a\/.+ b\/(.+)/);
        if (!pathMatch) continue;

        const filePath = pathMatch[1].trim();
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
