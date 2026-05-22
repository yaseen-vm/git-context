import {
  execCommand,
  validatePrNumber,
  validateRepoName,
  validateOwnerName,
} from '../utils/index.js';

export interface PRInfo {
  number: number;
  title: string;
  description: string;
  author: string;
  baseBranch: string;
  headBranch: string;
  diff: string;
  provider: 'github' | 'gitlab';
}

export interface RemoteInfo {
  provider: 'github' | 'gitlab';
  owner: string;
  repo: string;
}

export class PRAnalyzer {
  async detectRemote(): Promise<RemoteInfo | null> {
    try {
      const { stdout } = await execCommand('git remote get-url origin');
      const url = stdout.trim();

      const githubMatch = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
      if (githubMatch) {
        return {
          provider: 'github',
          owner: githubMatch[1],
          repo: githubMatch[2],
        };
      }

      const gitlabMatch = url.match(/gitlab\.com[:/]([^/]+)\/([^/.]+)/);
      if (gitlabMatch) {
        return {
          provider: 'gitlab',
          owner: gitlabMatch[1],
          repo: gitlabMatch[2],
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  async fetchPR(prNumber: number): Promise<PRInfo> {
    validatePrNumber(prNumber);

    const remote = await this.detectRemote();
    if (!remote) {
      throw new Error(
        'Could not detect remote provider. Ensure you are in a git repository with a GitHub or GitLab remote.',
      );
    }

    validateOwnerName(remote.owner);
    validateRepoName(remote.repo);

    if (remote.provider === 'github') {
      return this.fetchGitHubPR(remote, prNumber);
    } else {
      return this.fetchGitLabPR(remote, prNumber);
    }
  }

  private async fetchGitHubPR(remote: RemoteInfo, prNumber: number): Promise<PRInfo> {
    try {
      const { stdout: prJson } = await execCommand(
        `gh pr view ${prNumber} --json title,body,author,baseRefName,headRefName --repo ${remote.owner}/${remote.repo}`,
      );
      const prData = JSON.parse(prJson);

      const { stdout: diff } = await execCommand(
        `gh pr diff ${prNumber} --repo ${remote.owner}/${remote.repo}`,
      );

      return {
        number: prNumber,
        title: prData.title,
        description: prData.body || '',
        author: prData.author.login,
        baseBranch: prData.baseRefName,
        headBranch: prData.headRefName,
        diff,
        provider: 'github',
      };
    } catch (cause) {
      throw new Error(
        `Failed to fetch GitHub PR #${prNumber}. Ensure gh CLI is authenticated and the PR exists.`,
        { cause },
      );
    }
  }

  private async fetchGitLabPR(remote: RemoteInfo, prNumber: number): Promise<PRInfo> {
    try {
      const { stdout: mrJson } = await execCommand(
        `glab mr view ${prNumber} --json --repo ${remote.owner}/${remote.repo}`,
      );
      const mrData = JSON.parse(mrJson);

      const { stdout: diff } = await execCommand(
        `glab mr diff ${prNumber} --repo ${remote.owner}/${remote.repo}`,
      );

      return {
        number: prNumber,
        title: mrData.title,
        description: mrData.description || '',
        author: mrData.author.username,
        baseBranch: mrData.target_branch,
        headBranch: mrData.source_branch,
        diff,
        provider: 'gitlab',
      };
    } catch (cause) {
      throw new Error(
        `Failed to fetch GitLab MR #${prNumber}. Ensure glab CLI is authenticated and the MR exists.`,
        { cause },
      );
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await execCommand('gh --version');
      return true;
    } catch {
      try {
        await execCommand('glab --version');
        return true;
      } catch {
        return false;
      }
    }
  }
}
