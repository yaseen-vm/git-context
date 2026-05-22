import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PRAnalyzer } from '../../src/git-engine/pr-analyzer.js';

describe('PRAnalyzer', () => {
  let analyzer: PRAnalyzer;

  beforeEach(() => {
    analyzer = new PRAnalyzer();
    vi.restoreAllMocks();
  });

  describe('detectRemote', () => {
    it('should detect GitHub remote via HTTPS', async () => {
      const detectSpy = vi.spyOn(analyzer, 'detectRemote');
      detectSpy.mockResolvedValue({
        provider: 'github',
        owner: 'user',
        repo: 'repo',
      });

      const result = await analyzer.detectRemote();
      expect(result).toEqual({
        provider: 'github',
        owner: 'user',
        repo: 'repo',
      });
    });

    it('should detect GitLab remote via HTTPS', async () => {
      const detectSpy = vi.spyOn(analyzer, 'detectRemote');
      detectSpy.mockResolvedValue({
        provider: 'gitlab',
        owner: 'user',
        repo: 'repo',
      });

      const result = await analyzer.detectRemote();
      expect(result).toEqual({
        provider: 'gitlab',
        owner: 'user',
        repo: 'repo',
      });
    });

    it('should return null for unsupported remote', async () => {
      const detectSpy = vi.spyOn(analyzer, 'detectRemote');
      detectSpy.mockResolvedValue(null);

      const result = await analyzer.detectRemote();
      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      const detectSpy = vi.spyOn(analyzer, 'detectRemote');
      detectSpy.mockResolvedValue(null);

      const result = await analyzer.detectRemote();
      expect(result).toBeNull();
    });
  });

  describe('isAvailable', () => {
    it('should return true when gh CLI is available', async () => {
      const isAvailableSpy = vi.spyOn(analyzer, 'isAvailable');
      isAvailableSpy.mockResolvedValue(true);

      const result = await analyzer.isAvailable();
      expect(result).toBe(true);
    });

    it('should return true when glab CLI is available', async () => {
      const isAvailableSpy = vi.spyOn(analyzer, 'isAvailable');
      isAvailableSpy.mockResolvedValue(true);

      const result = await analyzer.isAvailable();
      expect(result).toBe(true);
    });

    it('should return false when neither CLI is available', async () => {
      const isAvailableSpy = vi.spyOn(analyzer, 'isAvailable');
      isAvailableSpy.mockResolvedValue(false);

      const result = await analyzer.isAvailable();
      expect(result).toBe(false);
    });
  });

  describe('fetchPR', () => {
    it('should throw when no remote is detected', async () => {
      const fetchSpy = vi.spyOn(analyzer, 'fetchPR');
      fetchSpy.mockRejectedValue(
        new Error(
          'Could not detect remote provider. Ensure you are in a git repository with a GitHub or GitLab remote.',
        ),
      );

      await expect(analyzer.fetchPR(1)).rejects.toThrow('Could not detect remote provider');
    });

    it('should fetch GitHub PR successfully', async () => {
      const fetchSpy = vi.spyOn(analyzer, 'fetchPR');
      fetchSpy.mockResolvedValue({
        number: 1,
        title: 'Test PR',
        description: 'PR description',
        author: 'testuser',
        baseBranch: 'main',
        headBranch: 'feature',
        diff: 'diff content',
        provider: 'github',
      });

      const result = await analyzer.fetchPR(1);
      expect(result).toEqual({
        number: 1,
        title: 'Test PR',
        description: 'PR description',
        author: 'testuser',
        baseBranch: 'main',
        headBranch: 'feature',
        diff: 'diff content',
        provider: 'github',
      });
    });

    it('should fetch GitLab MR successfully', async () => {
      const fetchSpy = vi.spyOn(analyzer, 'fetchPR');
      fetchSpy.mockResolvedValue({
        number: 1,
        title: 'Test MR',
        description: 'MR description',
        author: 'testuser',
        baseBranch: 'main',
        headBranch: 'feature',
        diff: 'diff content',
        provider: 'gitlab',
      });

      const result = await analyzer.fetchPR(1);
      expect(result).toEqual({
        number: 1,
        title: 'Test MR',
        description: 'MR description',
        author: 'testuser',
        baseBranch: 'main',
        headBranch: 'feature',
        diff: 'diff content',
        provider: 'gitlab',
      });
    });

    it('should throw when GitHub PR fetch fails', async () => {
      const fetchSpy = vi.spyOn(analyzer, 'fetchPR');
      fetchSpy.mockRejectedValue(new Error('Failed to fetch GitHub PR #999'));

      await expect(analyzer.fetchPR(999)).rejects.toThrow('Failed to fetch GitHub PR #999');
    });

    it('should throw when GitLab MR fetch fails', async () => {
      const fetchSpy = vi.spyOn(analyzer, 'fetchPR');
      fetchSpy.mockRejectedValue(new Error('Failed to fetch GitLab MR #999'));

      await expect(analyzer.fetchPR(999)).rejects.toThrow('Failed to fetch GitLab MR #999');
    });
  });
});
