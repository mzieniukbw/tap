import { Command } from "@cliffy/command";
import { colors } from "@std/fmt/colors.ts";
import { Input, Secret, Confirm } from "@cliffy/prompt";
import { ensureDir, exists } from "@std/fs/mod.ts";

export class SetupCommand extends Command {
  constructor() {
    super();
    this.description("Set up Testing Assistant Project")
      .option("--force", "Force setup even if already configured")
      .action(async (options) => {
        await this.executeSetup(options);
      });
  }

  private async executeSetup(options: any) {
    console.log(colors.blue("🚀 Testing Assistant Project Setup"));
    console.log(colors.gray("=" .repeat(40)));

    try {
      // Check if already set up
      const configDir = Deno.env.get("HOME") + "/.tap";
      const configExists = await exists(configDir + "/config.json");
      
      if (configExists && !options.force) {
        const shouldContinue = await Confirm.prompt({
          message: "TAP is already configured. Continue with setup?",
          default: false
        });
        
        if (!shouldContinue) {
          console.log(colors.yellow("Setup cancelled"));
          return;
        }
      }

      // Create config directory
      await ensureDir(configDir);

      // Gather configuration
      console.log(colors.yellow("📝 Configuration Setup"));
      
      const githubToken = await Secret.prompt({
        message: "GitHub Personal Access Token:",
        hint: "Get one from: https://github.com/settings/tokens"
      });

      const atlassianEmail = await Input.prompt({
        message: "Atlassian account email:",
        validate: (value) => {
          if (!value.includes("@")) return "Please enter a valid email address";
          return true;
        }
      });

      const atlassianToken = await Secret.prompt({
        message: "Atlassian API Token:",
        hint: "Get one from: https://id.atlassian.com/manage-profile/security/api-tokens"
      });

      const atlassianUrl = await Input.prompt({
        message: "Atlassian base URL:",
        default: "https://company.atlassian.net",
        validate: (value) => {
          try {
            new URL(value);
            return true;
          } catch {
            return "Please enter a valid URL";
          }
        }
      });

      // Save configuration
      const config = {
        github: {
          token: githubToken
        },
        atlassian: {
          email: atlassianEmail,
          token: atlassianToken,
          baseUrl: atlassianUrl
        },
        setupDate: new Date().toISOString()
      };

      await Deno.writeTextFile(
        configDir + "/config.json",
        JSON.stringify(config, null, 2)
      );

      // Set file permissions (readable only by user)
      await Deno.chmod(configDir + "/config.json", 0o600);

      console.log(colors.green("✅ Configuration saved to ~/.tap/config.json"));

      // Test connectivity
      console.log(colors.yellow("🔍 Testing API connectivity..."));
      
      const connectivityResults = await this.testConnectivity(config);
      
      if (connectivityResults.github && connectivityResults.jira && connectivityResults.confluence) {
        console.log(colors.green("✅ All API connections successful!"));
        console.log(colors.blue("🎉 Setup complete! You can now use TAP commands:"));
        console.log("  tap test-pr <pr-url>");
        console.log("  tap test-current-pr");
      } else {
        console.log(colors.yellow("⚠️  Some API connections failed. Please check your tokens."));
        if (!connectivityResults.github) console.log("  ❌ GitHub API failed");
        if (!connectivityResults.jira) console.log("  ❌ Jira API failed");
        if (!connectivityResults.confluence) console.log("  ❌ Confluence API failed");
      }

    } catch (error) {
      console.error(colors.red("❌ Setup failed:"));
      console.error(error);
      Deno.exit(1);
    }
  }

  private async testConnectivity(config: any): Promise<{
    github: boolean;
    jira: boolean;
    confluence: boolean;
  }> {
    const results = {
      github: false,
      jira: false,
      confluence: false
    };

    // Test GitHub
    try {
      const response = await fetch("https://api.github.com/user", {
        headers: {
          "Authorization": `token ${config.github.token}`,
          "Accept": "application/vnd.github.v3+json"
        }
      });
      
      if (response.ok) {
        const user = await response.json();
        console.log(`  ✅ GitHub: Connected as ${user.login}`);
        results.github = true;
      }
    } catch (error) {
      console.log(`  ❌ GitHub: ${error.message}`);
    }

    // Test Jira
    try {
      const authHeader = btoa(`${config.atlassian.email}:${config.atlassian.token}`);
      const response = await fetch(`${config.atlassian.baseUrl}/rest/api/3/myself`, {
        headers: {
          "Authorization": `Basic ${authHeader}`,
          "Accept": "application/json"
        }
      });
      
      if (response.ok) {
        const user = await response.json();
        console.log(`  ✅ Jira: Connected as ${user.emailAddress}`);
        results.jira = true;
      }
    } catch (error) {
      console.log(`  ❌ Jira: ${error.message}`);
    }

    // Test Confluence
    try {
      const authHeader = btoa(`${config.atlassian.email}:${config.atlassian.token}`);
      const response = await fetch(`${config.atlassian.baseUrl}/wiki/rest/api/user/current`, {
        headers: {
          "Authorization": `Basic ${authHeader}`,
          "Accept": "application/json"
        }
      });
      
      if (response.ok) {
        const user = await response.json();
        console.log(`  ✅ Confluence: Connected as ${user.username || user.userKey}`);
        results.confluence = true;
      }
    } catch (error) {
      console.log(`  ❌ Confluence: ${error.message}`);
    }

    return results;
  }
}