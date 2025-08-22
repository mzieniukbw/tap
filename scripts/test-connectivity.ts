#!/usr/bin/env -S deno run --allow-all

import { colors } from "@std/fmt/colors.ts";
import { exists } from "@std/fs/mod.ts";

interface Config {
  github: {
    token: string;
  };
  atlassian: {
    email: string;
    token: string;
    baseUrl: string;
  };
}

async function main() {
  console.log(colors.blue("🔍 TAP Connectivity Test"));
  console.log(colors.gray("=" .repeat(30)));

  try {
    // Load configuration
    const config = await loadConfig();
    
    // Test each service
    const results = await testAllServices(config);
    
    // Summary
    const allPassed = Object.values(results).every(Boolean);
    console.log("");
    if (allPassed) {
      console.log(colors.green("🎉 All services are accessible!"));
      console.log("TAP is ready to use.");
    } else {
      console.log(colors.red("❌ Some services failed connectivity test"));
      console.log("Please check your configuration and network connectivity.");
    }
    
  } catch (error) {
    console.error(colors.red("❌ Test failed:"));
    console.error(error.message);
    Deno.exit(1);
  }
}

async function loadConfig(): Promise<Config> {
  const configPath = Deno.env.get("HOME") + "/.tap/config.json";
  
  if (!(await exists(configPath))) {
    throw new Error("TAP not configured. Run setup first: deno run --allow-all scripts/setup.ts");
  }
  
  const configText = await Deno.readTextFile(configPath);
  return JSON.parse(configText);
}

async function testAllServices(config: Config) {
  const results = {
    github: false,
    jira: false,
    confluence: false,
    mcpServer: false
  };

  // Test GitHub API
  console.log("Testing GitHub API...");
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        "Authorization": `token ${config.github.token}`,
        "Accept": "application/vnd.github.v3+json"
      }
    });
    
    if (response.ok) {
      const user = await response.json();
      console.log(colors.green(`✅ GitHub: Connected as ${user.login}`));
      results.github = true;
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  } catch (error) {
    console.log(colors.red(`❌ GitHub: ${error.message}`));
  }

  // Test Jira API
  console.log("Testing Jira API...");
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
      console.log(colors.green(`✅ Jira: Connected as ${user.emailAddress}`));
      results.jira = true;
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  } catch (error) {
    console.log(colors.red(`❌ Jira: ${error.message}`));
  }

  // Test Confluence API
  console.log("Testing Confluence API...");
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
      console.log(colors.green(`✅ Confluence: Connected as ${user.username || user.userKey}`));
      results.confluence = true;
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  } catch (error) {
    console.log(colors.red(`❌ Confluence: ${error.message}`));
  }

  // Test MCP Server compilation
  console.log("Testing MCP Server...");
  try {
    // Check if MCP server can be started (basic validation)
    const mcpPath = "mcp-servers/atlassian-mcp/server.ts";
    if (await exists(mcpPath)) {
      console.log(colors.green(`✅ MCP Server: Available at ${mcpPath}`));
      results.mcpServer = true;
    } else {
      throw new Error("MCP server file not found");
    }
  } catch (error) {
    console.log(colors.red(`❌ MCP Server: ${error.message}`));
  }

  return results;
}

if (import.meta.main) {
  await main();
}