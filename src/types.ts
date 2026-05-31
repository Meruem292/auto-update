export interface AppConfig {
  githubToken: string;
  repoOwner: string;
  repoName: string;
  filePath: string;
  branch: string;
  commitMessage: string;
  cronExpression: string;
  isActive: boolean;
}
