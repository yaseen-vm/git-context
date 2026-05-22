import fs from 'fs';
import path from 'path';
import type { CIConfig, CIWorkflow } from './types.js';

export function parseCIConfig(repoPath: string): CIConfig | null {
  const workflows: CIWorkflow[] = [];
  let hasGitHubActions = false;
  let hasGitLabCI = false;

  const githubWorkflowsDir = path.join(repoPath, '.github', 'workflows');
  if (fs.existsSync(githubWorkflowsDir)) {
    hasGitHubActions = true;
    const files = fs
      .readdirSync(githubWorkflowsDir)
      .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));

    for (const file of files) {
      const filePath = path.join(githubWorkflowsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const workflow = parseGitHubWorkflow(file, filePath, content);
      if (workflow) {
        workflows.push(workflow);
      }
    }
  }

  const gitlabCIPath = path.join(repoPath, '.gitlab-ci.yml');
  if (fs.existsSync(gitlabCIPath)) {
    hasGitLabCI = true;
    const content = fs.readFileSync(gitlabCIPath, 'utf-8');
    const workflow = parseGitLabCI(content);
    if (workflow) {
      workflows.push(workflow);
    }
  }

  if (workflows.length === 0 && !hasGitHubActions && !hasGitLabCI) {
    return null;
  }

  const provider = hasGitHubActions ? 'github' : hasGitLabCI ? 'gitlab' : null;

  return {
    provider,
    workflows,
    hasGitHubActions,
    hasGitLabCI,
  };
}

function parseGitHubWorkflow(
  fileName: string,
  filePath: string,
  content: string,
): CIWorkflow | null {
  const nameMatch = content.match(/name:\s*(.+)/);
  const name = nameMatch ? nameMatch[1].trim().replace(/['"]/g, '') : fileName;

  const triggers: string[] = [];
  const triggerMatch = content.match(/on:\s*\n([\s\S]*?)(?=\n\w|\njobs:)/);
  if (triggerMatch) {
    const triggerBlock = triggerMatch[1];
    const triggerLines = triggerBlock
      .split('\n')
      .filter((l) => l.trim() && !l.trim().startsWith('#'));
    for (const line of triggerLines) {
      const trimmed = line.trim().replace(/:$/, '');
      if (
        trimmed &&
        !trimmed.startsWith('-') &&
        !trimmed.includes('branches') &&
        !trimmed.includes('paths')
      ) {
        triggers.push(trimmed);
      }
    }
  }

  const jobs: string[] = [];
  const steps: string[] = [];
  const jobMatch = content.match(/jobs:\s*\n([\s\S]*?)(?=\n\w|$)/);
  if (jobMatch) {
    const jobBlock = jobMatch[1];
    const jobLines = jobBlock.split('\n');
    for (const line of jobLines) {
      const jobNameMatch = line.match(/^\s+(\w[\w-]*):/);
      if (
        jobNameMatch &&
        !line.includes('runs-on') &&
        !line.includes('steps') &&
        !line.includes('uses') &&
        !line.includes('with') &&
        !line.includes('run')
      ) {
        jobs.push(jobNameMatch[1]);
      }
    }

    const stepMatches = content.matchAll(/run:\s*(.+)/g);
    for (const match of stepMatches) {
      steps.push(match[1].trim().replace(/['"]/g, ''));
    }
  }

  const hasTestStep = steps.some(
    (s) => s.includes('test') || s.includes('jest') || s.includes('vitest') || s.includes('mocha'),
  );
  const hasLintStep = steps.some((s) => s.includes('lint') || s.includes('eslint'));
  const hasBuildStep = steps.some(
    (s) => s.includes('build') || s.includes('compile') || s.includes('tsc'),
  );
  const hasDeployStep = steps.some(
    (s) => s.includes('deploy') || s.includes('publish') || s.includes('release'),
  );

  let nodeVersion: string | null = null;
  const nodeVersionMatch = content.match(/node-version:\s*['"]?(\d+[\w.]*)/);
  if (nodeVersionMatch) {
    nodeVersion = nodeVersionMatch[1];
  }

  return {
    name,
    filePath: `.github/workflows/${fileName}`,
    provider: 'github',
    triggers,
    jobs,
    steps,
    hasTestStep,
    hasLintStep,
    hasBuildStep,
    hasDeployStep,
    nodeVersion,
  };
}

function parseGitLabCI(content: string): CIWorkflow | null {
  const stages: string[] = [];
  const stageMatch = content.match(/stages:\s*\n([\s\S]*?)(?=\n\w|$)/);
  if (stageMatch) {
    const stageLines = stageMatch[1].split('\n');
    for (const line of stageLines) {
      const stageName = line.trim().replace(/^-\s*/, '');
      if (stageName && !stageName.startsWith('#')) {
        stages.push(stageName);
      }
    }
  }

  const jobs: string[] = [];
  const steps: string[] = [];
  const lines = content.split('\n');
  for (const line of lines) {
    const jobMatch = line.match(/^(\w[\w-]*):/);
    if (
      jobMatch &&
      ![
        'stages',
        'variables',
        'image',
        'services',
        'before_script',
        'after_script',
        'cache',
      ].includes(jobMatch[1])
    ) {
      jobs.push(jobMatch[1]);
    }

    const scriptMatch = line.match(/script:\s*(.+)/);
    if (scriptMatch) {
      steps.push(scriptMatch[1].trim().replace(/['"]/g, ''));
    }
  }

  const scriptBlockMatch = content.match(/script:\s*\n([\s\S]*?)(?=\n\w|$)/);
  if (scriptBlockMatch) {
    const scriptLines = scriptBlockMatch[1].split('\n');
    for (const line of scriptLines) {
      const step = line.trim().replace(/^-\s*/, '');
      if (step && !step.startsWith('#')) {
        steps.push(step);
      }
    }
  }

  const hasTestStep = steps.some(
    (s) => s.includes('test') || s.includes('jest') || s.includes('vitest') || s.includes('mocha'),
  );
  const hasLintStep = steps.some((s) => s.includes('lint') || s.includes('eslint'));
  const hasBuildStep = steps.some(
    (s) => s.includes('build') || s.includes('compile') || s.includes('tsc'),
  );
  const hasDeployStep = steps.some(
    (s) => s.includes('deploy') || s.includes('publish') || s.includes('release'),
  );

  let nodeVersion: string | null = null;
  const nodeVersionMatch = content.match(/node:(\d+[\w.]*)/);
  if (nodeVersionMatch) {
    nodeVersion = nodeVersionMatch[1];
  }

  return {
    name: 'GitLab CI',
    filePath: '.gitlab-ci.yml',
    provider: 'gitlab',
    triggers: stages,
    jobs,
    steps,
    hasTestStep,
    hasLintStep,
    hasBuildStep,
    hasDeployStep,
    nodeVersion,
  };
}

export function summarizeCIConfig(config: CIConfig | null): string[] {
  if (!config) {
    return ['No CI configuration found'];
  }

  const conventions: string[] = [];

  if (config.hasGitHubActions) {
    conventions.push('CI: GitHub Actions');
  }

  if (config.hasGitLabCI) {
    conventions.push('CI: GitLab CI');
  }

  for (const workflow of config.workflows) {
    conventions.push(`Workflow: ${workflow.name}`);

    if (workflow.triggers.length > 0) {
      conventions.push(`  Triggers: ${workflow.triggers.join(', ')}`);
    }

    if (workflow.jobs.length > 0) {
      conventions.push(`  Jobs: ${workflow.jobs.join(', ')}`);
    }

    const pipelineSteps: string[] = [];
    if (workflow.hasTestStep) pipelineSteps.push('test');
    if (workflow.hasLintStep) pipelineSteps.push('lint');
    if (workflow.hasBuildStep) pipelineSteps.push('build');
    if (workflow.hasDeployStep) pipelineSteps.push('deploy');

    if (pipelineSteps.length > 0) {
      conventions.push(`  Pipeline steps: ${pipelineSteps.join(', ')}`);
    }

    if (workflow.nodeVersion) {
      conventions.push(`  Node.js version: ${workflow.nodeVersion}`);
    }
  }

  return conventions;
}
