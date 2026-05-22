export type MonorepoTool =
  | 'turborepo'
  | 'nx'
  | 'lerna'
  | 'yarn-workspaces'
  | 'pnpm-workspaces'
  | 'npm-workspaces';

export interface WorkspacePackage {
  name: string;
  path: string;
  relativePath: string;
}

export interface MonorepoInfo {
  isMonorepo: boolean;
  tools: MonorepoTool[];
  rootPath: string;
  packages: WorkspacePackage[];
  workspaceGlobs: string[];
}
