export interface PRAnalysis {
  url: string;
  number: number;
  title: string;
  description: string;
  author: string;
  branch: string;
  baseBranch: string;
  changedFiles: ChangedFile[];
  commits: Commit[];
  labels: string[];
  jiraTicketKeys: string[];
}

export interface ChangedFile {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  additions: number;
  deletions: number;
  diff?: string;
}

export interface Commit {
  sha: string;
  message: string;
  author: string;
  date: string;
}

import { ConfigService } from './config';

export class GitHubService {
  private configService: ConfigService;

  constructor() {
    this.configService = ConfigService.getInstance();
  }

  async analyzePR(prUrl: string): Promise<PRAnalysis> {
    const { owner, repo, number } = this.parsePRUrl(prUrl);
    
    // Get PR details
    const prResponse = await this.githubRequest(`/repos/${owner}/${repo}/pulls/${number}`);
    
    // Get PR files
    const filesResponse = await this.githubRequest(`/repos/${owner}/${repo}/pulls/${number}/files`);
    
    // Get PR commits
    const commitsResponse = await this.githubRequest(`/repos/${owner}/${repo}/pulls/${number}/commits`);
    
    // Extract Jira ticket keys from PR title and description
    const jiraTicketKeys = this.extractJiraTicketKeys(prResponse.title + " " + (prResponse.body || ""));
    
    const changedFiles: ChangedFile[] = filesResponse.map((file: any) => ({
      path: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      diff: file.patch
    }));
    
    const commits: Commit[] = commitsResponse.map((commit: any) => ({
      sha: commit.sha,
      message: commit.commit.message,
      author: commit.commit.author.name,
      date: commit.commit.author.date
    }));
    
    return {
      url: prUrl,
      number: prResponse.number,
      title: prResponse.title,
      description: prResponse.body || "",
      author: prResponse.user.login,
      branch: prResponse.head.ref,
      baseBranch: prResponse.base.ref,
      changedFiles,
      commits,
      labels: prResponse.labels.map((label: any) => label.name),
      jiraTicketKeys
    };
  }

  /**
   * This method simulates what Claude Code CLI would do internally
   * In reality, Claude Code CLI would handle this automatically
   */
  async getCodeDiffs(owner: string, repo: string, number: number): Promise<string[]> {
    const files = await this.githubRequest(`/repos/${owner}/${repo}/pulls/${number}/files`);
    return files.map((file: any) => file.patch || "").filter(Boolean);
  }

  private parsePRUrl(url: string): { owner: string; repo: string; number: number } {
    const match = url.match(/github\.com\/(.+?)\/(.+?)\/pull\/(\d+)/);
    if (!match) {
      throw new Error("Invalid GitHub PR URL format");
    }
    
    return {
      owner: match[1],
      repo: match[2],
      number: parseInt(match[3])
    };
  }

  private async githubRequest(endpoint: string): Promise<any> {
    const authHeader = await this.configService.getGitHubAuthHeader();
    const response = await fetch(`https://api.github.com${endpoint}`, {
      headers: {
        "Authorization": authHeader,
        "Accept": "application/vnd.github.v3+json"
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  private extractJiraTicketKeys(text: string): string[] {
    // Match patterns like PROJ-123, ABC-456, etc.
    const jiraPattern = /\b[A-Z][A-Z0-9]+-\d+\b/g;
    const matches = text.match(jiraPattern);
    return matches ? [...new Set(matches)] : [];
  }
}