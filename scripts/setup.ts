#!/usr/bin/env -S deno run --allow-all

import { colors } from "@std/fmt/colors.ts";
import { ensureDir, exists } from "@std/fs/mod.ts";
import { Input, Secret, Confirm } from "@cliffy/prompt";

interface Config {
  github: {
    token: string;
  };
  atlassian: {
    email: string;
    token: string;
    baseUrl: string;
  };
  setupDate: string;
}

async function main() {
  console.log(colors.blue("🚀 Testing Assistant Project (TAP) Setup"));
  console.log(colors.gray("=" .repeat(45)));

  try {
    // Check if already set up
    const configDir = Deno.env.get("HOME") + "/.tap";
    const configExists = await exists(configDir + "/config.json");
    
    if (configExists) {
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

    // Check prerequisites
    await checkPrerequisites();

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
    const config: Config = {
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
    
    const connectivityResults = await testConnectivity(config);
    
    if (connectivityResults.github && connectivityResults.jira && connectivityResults.confluence) {
      console.log(colors.green("✅ All API connections successful!"));
      
      // Setup environment variables
      await setupEnvironment(config);
      
      // Compile executables
      await compileExecutables();
      
      console.log(colors.blue("🎉 Setup complete!"));
      console.log("");
      console.log("Available commands:");
      console.log("  deno run --allow-all tap/src/main.ts test-pr <pr-url>");
      console.log("  deno run --allow-all tap/src/main.ts test-current-pr");
      console.log("");
      console.log("Or use compiled executable:");
      console.log("  ./dist/tap test-pr <pr-url>");
      
    } else {
      console.log(colors.yellow("⚠️  Some API connections failed. Please check your tokens."));
      if (!connectivityResults.github) console.log("  ❌ GitHub API failed");
      if (!connectivityResults.jira) console.log("  ❌ Jira API failed");
      if (!connectivityResults.confluence) console.log("  ❌ Confluence API failed");
    }

  } catch (error) {
    console.error(colors.red("❌ Setup failed:"));
    console.error(error.message);
    Deno.exit(1);
  }
}

async function checkPrerequisites() {
  console.log(colors.yellow("🔍 Checking prerequisites..."));
  
  // Check Deno version
  const denoVersion = Deno.version.deno;
  console.log(`  ✅ Deno ${denoVersion}`);
  
  // Check if git is available
  try {
    const cmd = new Deno.Command("git", { args: ["--version"], stdout: "piped" });
    const { success } = await cmd.output();
    if (success) {
      console.log("  ✅ Git available");
    } else {
      throw new Error("Git not found");
    }
  } catch {
    console.log(colors.red("  ❌ Git not found - required for PR analysis"));
    throw new Error("Git is required but not found in PATH");
  }
}

async function testConnectivity(config: Config): Promise<{
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

async function setupEnvironment(config: Config) {
  console.log(colors.yellow("⚙️  Setting up environment..."));
  
  // Create environment file for MCP server
  const envContent = [
    `GITHUB_TOKEN=${config.github.token}`,
    `ATLASSIAN_EMAIL=${config.atlassian.email}`,
    `ATLASSIAN_API_TOKEN=${config.atlassian.token}`,
    `ATLASSIAN_BASE_URL=${config.atlassian.baseUrl}`,
  ].join('\n');
  
  await Deno.writeTextFile('.env', envContent);
  await Deno.chmod('.env', 0o600);
  
  console.log("  ✅ Environment variables configured");
}

async function compileExecutables() {
  console.log(colors.yellow("🔨 Compiling executables..."));
  
  try {
    await ensureDir("dist");
    
    // Compile main TAP executable
    const compileCmd = new Deno.Command("deno", {
      args: [
        "compile",
        "--allow-all",
        "--output=dist/tap",
        "src/main.ts"
      ],
      stdout: "piped",
      stderr: "piped"
    });
    
    const { success } = await compileCmd.output();
    
    if (success) {
      console.log("  ✅ TAP executable compiled to dist/tap");
    } else {
      console.log("  ⚠️  Failed to compile executable (not critical)");
    }
    
  } catch (error) {
    console.log(`  ⚠️  Compilation skipped: ${error.message}`);
  }
}

if (import.meta.main) {
  await main();
}