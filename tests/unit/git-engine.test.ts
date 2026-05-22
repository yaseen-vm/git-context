import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GitEngine, GitDiff, GitCommit } from '../../src/git-engine/index.js';

vi.mock('simple-git', () => {
  const mockGit = {
    status: vi.fn().mockResolvedValue({}),
    diff: vi.fn().mockResolvedValue(''),
    log: vi.fn().mockResolvedValue({ all: [] }),
    show: vi.fn().mockResolvedValue(''),
    raw: vi.fn().mockResolvedValue(''),
    getRemotes: vi.fn().mockResolvedValue([]),
    branch: vi.fn().mockResolvedValue({ all: [] }),
  };
  return {
    default: vi.fn().mockReturnValue(mockGit),
  };
});

describe('GitEngine', () => {
  let engine: GitEngine;

  beforeEach(() => {
    engine = new GitEngine('/test/repo');
  });

  describe('Input validation', () => {
    describe('getCommitDiff', () => {
      it('should throw on empty SHA', async () => {
        await expect(engine.getCommitDiff('')).rejects.toThrow('SHA must be a non-empty string');
      });

      it('should throw on invalid SHA format', async () => {
        await expect(engine.getCommitDiff('not-a-sha')).rejects.toThrow(
          'SHA must be a valid git commit hash',
        );
      });

      it('should throw on SHA with special characters', async () => {
        await expect(engine.getCommitDiff('abc;rm -rf /')).rejects.toThrow(
          'SHA must be a valid git commit hash',
        );
      });

      it('should accept valid short SHA', async () => {
        const mockDiff =
          'diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new';
        const simpleGit = (await import('simple-git')).default;
        const mockGitInstance = simpleGit('/test/repo');
        (mockGitInstance.diff as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
          '1 file changed, 1 insertion(+), 1 deletion(-)',
        );
        (mockGitInstance.diff as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockDiff);

        await expect(engine.getCommitDiff('abc123')).resolves.toBeDefined();
      });

      it('should accept valid full SHA', async () => {
        const sha = 'a'.repeat(40);
        const mockDiff =
          'diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new';
        const simpleGit = (await import('simple-git')).default;
        const mockGitInstance = simpleGit('/test/repo');
        (mockGitInstance.diff as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
          '1 file changed, 1 insertion(+), 1 deletion(-)',
        );
        (mockGitInstance.diff as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockDiff);

        await expect(engine.getCommitDiff(sha)).resolves.toBeDefined();
      });
    });

    describe('getBranchDiff', () => {
      it('should throw on empty branch name', async () => {
        await expect(engine.getBranchDiff('')).rejects.toThrow('branch must be a non-empty string');
      });

      it('should throw on branch with range syntax', async () => {
        await expect(engine.getBranchDiff('main..feature')).rejects.toThrow(
          'branch must not contain ".." range syntax',
        );
      });

      it('should throw on branch with invalid git characters', async () => {
        await expect(engine.getBranchDiff('feature~1')).rejects.toThrow(
          'branch contains invalid git characters',
        );
        await expect(engine.getBranchDiff('feature^2')).rejects.toThrow(
          'branch contains invalid git characters',
        );
        await expect(engine.getBranchDiff('feature:dev')).rejects.toThrow(
          'branch contains invalid git characters',
        );
        await expect(engine.getBranchDiff('feature?')).rejects.toThrow(
          'branch contains invalid git characters',
        );
        await expect(engine.getBranchDiff('feature*')).rejects.toThrow(
          'branch contains invalid git characters',
        );
      });

      it('should throw on base branch with range syntax', async () => {
        await expect(engine.getBranchDiff('feature', 'main..dev')).rejects.toThrow(
          'base branch must not contain ".." range syntax',
        );
      });

      it('should accept valid branch names', async () => {
        const mockDiff =
          'diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new';
        const simpleGit = (await import('simple-git')).default;
        const mockGitInstance = simpleGit('/test/repo');
        (mockGitInstance.diff as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
          '1 file changed, 1 insertion(+), 1 deletion(-)',
        );
        (mockGitInstance.diff as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockDiff);

        await expect(engine.getBranchDiff('feature-branch')).resolves.toBeDefined();
      });
    });

    describe('getRecentCommits', () => {
      it('should throw on non-integer count', async () => {
        await expect(engine.getRecentCommits(undefined, -1)).rejects.toThrow(
          'count must be a positive integer',
        );
      });

      it('should throw on count exceeding 1000', async () => {
        await expect(engine.getRecentCommits(undefined, 1001)).rejects.toThrow(
          'count must not exceed 1000',
        );
      });

      it('should throw on file path with traversal', async () => {
        await expect(engine.getRecentCommits('../etc/passwd')).rejects.toThrow(
          'filePath must not contain path traversal',
        );
      });

      it('should throw on file path with null byte', async () => {
        await expect(engine.getRecentCommits('file.ts\0')).rejects.toThrow(
          'filePath contains null byte',
        );
      });

      it('should accept valid parameters', async () => {
        const simpleGit = (await import('simple-git')).default;
        const mockGitInstance = simpleGit('/test/repo');
        (mockGitInstance.log as ReturnType<typeof vi.fn>).mockResolvedValue({
          all: [
            {
              hash: 'abc123',
              date: '2024-01-01',
              message: 'test commit',
              author_name: 'Test User',
              author_email: 'test@example.com',
            },
          ],
        });

        const result = await engine.getRecentCommits('src/file.ts', 5);
        expect(result).toHaveLength(1);
        expect(result[0].hash).toBe('abc123');
      });
    });

    describe('getFileContent', () => {
      it('should throw on file path with traversal', async () => {
        await expect(engine.getFileContent('../etc/passwd')).rejects.toThrow(
          'filePath must not contain path traversal',
        );
      });

      it('should throw on file path with null byte', async () => {
        await expect(engine.getFileContent('file.ts\0')).rejects.toThrow(
          'filePath contains null byte',
        );
      });

      it('should accept valid file path', async () => {
        const simpleGit = (await import('simple-git')).default;
        const mockGitInstance = simpleGit('/test/repo');
        (mockGitInstance.show as ReturnType<typeof vi.fn>).mockResolvedValue('file content');

        const result = await engine.getFileContent('src/file.ts');
        expect(result).toBe('file content');
      });
    });

    describe('getFileBlame', () => {
      it('should throw on file path with traversal', async () => {
        await expect(engine.getFileBlame('../etc/passwd')).rejects.toThrow(
          'filePath must not contain path traversal',
        );
      });

      it('should accept valid file path', async () => {
        const simpleGit = (await import('simple-git')).default;
        const mockGitInstance = simpleGit('/test/repo');
        (mockGitInstance.raw as ReturnType<typeof vi.fn>).mockResolvedValue('blame output');

        const result = await engine.getFileBlame('src/file.ts');
        expect(result).toBe('blame output');
      });
    });

    describe('getPRDiff', () => {
      it('should throw on non-positive PR number', async () => {
        await expect(engine.getPRDiff(0)).rejects.toThrow('PR number must be a positive integer');
        await expect(engine.getPRDiff(-1)).rejects.toThrow('PR number must be a positive integer');
      });
    });
  });

  describe('isRepository', () => {
    it('should return true for valid repository', async () => {
      const result = await engine.isRepository();
      expect(result).toBe(true);
    });

    it('should return false when status throws', async () => {
      const simpleGit = (await import('simple-git')).default;
      const mockGitInstance = simpleGit('/test/repo');
      (mockGitInstance.status as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('not a git repo'),
      );

      const result = await engine.isRepository();
      expect(result).toBe(false);
    });
  });

  describe('getStagedDiff', () => {
    it('should return parsed diff for staged changes', async () => {
      const mockDiff =
        'diff --git a/file.ts b/file.ts\nnew file mode 100644\n--- /dev/null\n+++ b/file.ts\n@@ -0,0 +1 @@\n+new content';
      const simpleGit = (await import('simple-git')).default;
      const mockGitInstance = simpleGit('/test/repo');
      (mockGitInstance.diff as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        '1 file changed, 1 insertion(+)',
      );
      (mockGitInstance.diff as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockDiff);

      const result = await engine.getStagedDiff();
      expect(result.files).toHaveLength(1);
      expect(result.files[0].status).toBe('added');
      expect(result.stats.filesChanged).toBe(1);
      expect(result.stats.insertions).toBe(1);
    });
  });

  describe('getUnstagedDiff', () => {
    it('should return parsed diff for unstaged changes', async () => {
      const mockDiff =
        'diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new';
      const simpleGit = (await import('simple-git')).default;
      const mockGitInstance = simpleGit('/test/repo');
      (mockGitInstance.diff as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        '1 file changed, 1 insertion(+), 1 deletion(-)',
      );
      (mockGitInstance.diff as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockDiff);

      const result = await engine.getUnstagedDiff();
      expect(result.files).toHaveLength(1);
      expect(result.files[0].status).toBe('modified');
    });
  });

  describe('getRemoteUrl', () => {
    it('should return remote URL when origin exists', async () => {
      const simpleGit = (await import('simple-git')).default;
      const mockGitInstance = simpleGit('/test/repo');
      (mockGitInstance.getRemotes as ReturnType<typeof vi.fn>).mockResolvedValue([
        { name: 'origin', refs: { fetch: 'https://github.com/user/repo.git' } },
      ]);

      const result = await engine.getRemoteUrl();
      expect(result).toBe('https://github.com/user/repo.git');
    });

    it('should return null when no origin exists', async () => {
      const simpleGit = (await import('simple-git')).default;
      const mockGitInstance = simpleGit('/test/repo');
      (mockGitInstance.getRemotes as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await engine.getRemoteUrl();
      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      const simpleGit = (await import('simple-git')).default;
      const mockGitInstance = simpleGit('/test/repo');
      (mockGitInstance.getRemotes as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('git error'),
      );

      const result = await engine.getRemoteUrl();
      expect(result).toBeNull();
    });
  });

  describe('getDefaultBranch', () => {
    it('should return main by default', async () => {
      const simpleGit = (await import('simple-git')).default;
      const mockGitInstance = simpleGit('/test/repo');
      (mockGitInstance.raw as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('not found'));
      (mockGitInstance.getRemotes as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await engine.getDefaultBranch();
      expect(result).toBe('main');
    });

    it('should return branch from symbolic-ref', async () => {
      const simpleGit = (await import('simple-git')).default;
      const mockGitInstance = simpleGit('/test/repo');
      (mockGitInstance.raw as ReturnType<typeof vi.fn>).mockResolvedValue('origin/develop\n');

      const result = await engine.getDefaultBranch();
      expect(result).toBe('develop');
    });
  });
});
