import { Command } from "commander";
import chalk from "chalk";
import { execSync } from "child_process";

async function executeCurrentPRTest(options: any) {
  console.log(chalk.blue("🔍 Auto-detecting current PR..."));
  
  try {
    // Get current branch
    const currentBranch = await getCurrentBranch();
    console.log(`Current branch: ${currentBranch}`);
    
    // Get remote origin URL
    const remoteUrl = await getRemoteOriginUrl();
    console.log(`Repository: ${remoteUrl}`);
    
    // Find PR for current branch
    const prUrl = await findPRForBranch(remoteUrl, currentBranch);
    
    if (!prUrl) {
      console.log(chalk.yellow("⚠️ No PR found for current branch"));
      console.log("Make sure your branch has an associated pull request on GitHub");
      process.exit(1);
    }
    
    console.log(chalk.green(`Found PR: ${prUrl}`));
    
    // Execute the PR test using the same logic as test-pr command
    console.log(chalk.green(`Executing PR test for: ${prUrl}`));
    console.log(chalk.yellow("Note: This would call the test-pr functionality"));
    
  } catch (error) {
    console.error(chalk.red("❌ Error detecting current PR:"));
    console.error(error);
    process.exit(1);
  }
}

async function getCurrentBranch(): Promise<string> {
  try {
    const result = execSync("git rev-parse --abbrev-ref HEAD", { encoding: 'utf8' });
    return result.trim();
  } catch (error) {
    throw new Error(`Failed to get current branch: ${error}`);
  }
}

async function getRemoteOriginUrl(): Promise<string> {
  try {
    const result = execSync("git config --get remote.origin.url", { encoding: 'utf8' });
    return result.trim();
  } catch (error) {
    throw new Error(`Failed to get remote origin URL: ${error}`);
  }
}

async function findPRForBranch(remoteUrl: string, branch: string): Promise<string | null> {
  // Parse GitHub URL to get owner/repo
  const match = remoteUrl.match(/github\.com[:/](.+?)\/(.+?)(?:\.git)?$/);
  if (!match) {
    throw new Error("Not a GitHub repository or invalid URL format");
  }
  
  const owner = match[1];
  const repo = match[2];
  
  // Use GitHub API to find PR for branch
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    throw new Error("GITHUB_TOKEN environment variable is required");
  }
  
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/pulls?head=${owner}:${branch}&state=open`;
  
  try {
    const response = await fetch(apiUrl, {
      headers: {
        "Authorization": `token ${githubToken}`,
        "Accept": "application/vnd.github.v3+json"
      }
    });
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
    
    const prs = await response.json();
    
    if (prs.length === 0) {
      return null;
    }
    
    return prs[0].html_url;
  } catch (error) {
    throw new Error(`Failed to find PR for branch ${branch}: ${error}`);
  }
}

export const testCurrentPRCommand = new Command("test-current-pr")
  .description("Test the current branch's PR (auto-detect)")
  .option("--focus <areas>", "Focus testing on specific areas (comma-separated)")
  .option("--skip-execution", "Generate scenarios but don't execute tests")
  .option("--output <path>", "Output directory for test artifacts", "./tap-output")
  .action(executeCurrentPRTest);