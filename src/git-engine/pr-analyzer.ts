import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
      const { stdout } = await execAsync('git remote get-url origin');
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
    const remote = await this.detectRemote();
    if (!remote) {
      throw new Error(
        'Could not detect remote provider. Ensure you are in a git repository with a GitHub or GitLab remote.',
      );
    }

    if (remote.provider === 'github') {
      return this.fetchGitHubPR(remote, prNumber);
    } else {
      return this.fetchGitLabPR(remote, prNumber);
    }
  }

  private async fetchGitHubPR(remote: RemoteInfo, prNumber: number): Promise<PRInfo> {
    try {
      const { stdout: prJson } = await execAsync(
        `gh pr view ${prNumber} --json title,body,author,baseRefName,headRefName --repo ${remote.owner}/${remote.repo}`,
      );
      const prData = JSON.parse(prJson);

      const { stdout: diff } = await execAsync(
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
      const { stdout: mrJson } = await execAsync(
        `glab mr view ${prNumber} --json --repo ${remote.owner}/${remote.repo}`,
      );
      const mrData = JSON.parse(mrJson);

      const { stdout: diff } = await execAsync(
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
      await execAsync('gh --version');
      return true;
    } catch {
      try {
        await execAsync('glab --version');
        return true;
      } catch {
        return false;
      }
    }
  }
}
