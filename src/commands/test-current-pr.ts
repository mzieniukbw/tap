import { Command } from "@cliffy/command";
import { colors } from "@std/fmt/colors.ts";
import { TestPRCommand } from "./test-pr.ts";

export class TestCurrentPRCommand extends Command {
  constructor() {
    super();
    this.description("Test the current branch's PR (auto-detect)")
      .option("--focus <areas:string>", "Focus testing on specific areas (comma-separated)")
      .option("--skip-execution", "Generate scenarios but don't execute tests")
      .option("--output <path:string>", "Output directory for test artifacts", {
        default: "./tap-output"
      })
      .action(async (options) => {
        await this.executeCurrentPRTest(options);
      });
  }

  private async executeCurrentPRTest(options: any) {
    console.log(colors.blue("🔍 Auto-detecting current PR..."));
    
    try {
      // Get current branch
      const currentBranch = await this.getCurrentBranch();
      console.log(`Current branch: ${currentBranch}`);
      
      // Get remote origin URL
      const remoteUrl = await this.getRemoteOriginUrl();
      console.log(`Repository: ${remoteUrl}`);
      
      // Find PR for current branch
      const prUrl = await this.findPRForBranch(remoteUrl, currentBranch);
      
      if (!prUrl) {
        console.log(colors.yellow("⚠️  No open PR found for current branch"));
        console.log("To test a specific PR, use: tap test-pr <pr-url>");
        return;
      }
      
      console.log(colors.green(`✅ Found PR: ${prUrl}`));
      console.log(colors.gray("-".repeat(30)));
      
      // Delegate to test-pr command
      const testPRCommand = new TestPRCommand();
      await testPRCommand["executePRTest"](prUrl, options);
      
    } catch (error) {
      console.error(colors.red("❌ Error detecting current PR:"));
      console.error(error);
      Deno.exit(1);
    }
  }

  private async getCurrentBranch(): Promise<string> {
    const cmd = new Deno.Command("git", {
      args: ["rev-parse", "--abbrev-ref", "HEAD"],
      stdout: "piped",
      stderr: "piped"
    });
    
    const { code, stdout, stderr } = await cmd.output();
    
    if (code !== 0) {
      const error = new TextDecoder().decode(stderr);
      throw new Error(`Failed to get current branch: ${error}`);
    }
    
    return new TextDecoder().decode(stdout).trim();
  }

  private async getRemoteOriginUrl(): Promise<string> {
    const cmd = new Deno.Command("git", {
      args: ["config", "--get", "remote.origin.url"],
      stdout: "piped",
      stderr: "piped"
    });
    
    const { code, stdout, stderr } = await cmd.output();
    
    if (code !== 0) {
      const error = new TextDecoder().decode(stderr);
      throw new Error(`Failed to get remote origin URL: ${error}`);
    }
    
    return new TextDecoder().decode(stdout).trim();
  }

  private async findPRForBranch(remoteUrl: string, branch: string): Promise<string | null> {
    // Parse GitHub URL to get owner/repo
    const match = remoteUrl.match(/github\.com[:/](.+?)\/(.+?)(?:\.git)?$/);
    if (!match) {
      throw new Error("Remote origin is not a GitHub repository");
    }
    
    const [, owner, repo] = match;
    
    // Use GitHub API to find PR for branch
    const githubToken = Deno.env.get("GITHUB_TOKEN");
    if (!githubToken) {
      throw new Error("GITHUB_TOKEN environment variable is required");
    }
    
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls?head=${owner}:${branch}&state=open`,
      {
        headers: {
          "Authorization": `token ${githubToken}`,
          "Accept": "application/vnd.github.v3+json"
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
    
    const prs = await response.json();
    
    if (prs.length === 0) {
      return null;
    }
    
    return prs[0].html_url;
  }
}