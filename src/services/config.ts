import { readFile, access } from "fs/promises";
import { homedir } from "os";
import chalk from "chalk";

export interface TapConfig {
  github: {
    token: string;
  };
  atlassian: {
    baseUrl: string;
    email: string;
    apiToken: string;
  };
  onyx?: {
    baseUrl: string;
    apiKey: string;
  };
}

export class ConfigService {
  private static instance: ConfigService;
  private config: TapConfig | null = null;

  private constructor() {}

  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  async getConfig(): Promise<TapConfig> {
    if (this.config) {
      return this.config;
    }

    this.config = await this.loadConfig();
    return this.config;
  }

  private async loadConfig(): Promise<TapConfig> {
    // First try to load from config.json
    const configFromFile = await this.loadFromConfigFile();
    if (configFromFile) {
      console.log(chalk.gray("📄 Using config from ~/.tap/config.json"));
      return configFromFile;
    }

    // Fallback to environment variables
    const configFromEnv = await this.loadFromEnvironment();
    if (configFromEnv) {
      console.log(chalk.gray("🌍 Using config from environment variables"));
      return configFromEnv;
    }

    throw new Error(
      "No configuration found. Please run 'tap setup' or set environment variables:\n" +
        "  • GITHUB_TOKEN\n" +
        "  • ATLASSIAN_BASE_URL\n" +
        "  • ATLASSIAN_EMAIL\n" +
        "  • ATLASSIAN_API_TOKEN\n" +
        "  • ONYX_BASE_URL (optional - for self-hosted Onyx instances)\n" +
        "  • ONYX_API_KEY (optional - for enhanced product context)\n" +
        "  • ANTHROPIC_API_KEY (required for test execution)\n" +
        "\nInstall dependencies:\n" +
        "  • Claude CLI for AI test generation: npm install -g @anthropic-ai/claude-cli\n" +
        "  • Open Interpreter for test execution (Python 3.10/3.11): pip install open-interpreter"
    );
  }

  private async loadFromConfigFile(): Promise<TapConfig | null> {
    try {
      const configPath = `${homedir()}/.tap/config.json`;
      await access(configPath);
      const configContent = await readFile(configPath, "utf-8");
      const config = JSON.parse(configContent);

      // Validate config structure
      if (this.isValidConfig(config)) {
        return config;
      }

      console.warn(
        chalk.yellow("⚠️  Invalid config file format, falling back to environment variables")
      );
      return null;
    } catch {
      return null;
    }
  }

  private async loadFromEnvironment(): Promise<TapConfig | null> {
    const githubToken = process.env.GITHUB_TOKEN;
    const atlassianBaseUrl = process.env.ATLASSIAN_BASE_URL;
    const atlassianEmail = process.env.ATLASSIAN_EMAIL;
    const atlassianApiToken = process.env.ATLASSIAN_API_TOKEN;
    const onyxBaseUrl = process.env.ONYX_BASE_URL;
    const onyxApiKey = process.env.ONYX_API_KEY;

    if (!githubToken || !atlassianBaseUrl || !atlassianEmail || !atlassianApiToken) {
      return null;
    }

    const config: TapConfig = {
      github: {
        token: githubToken,
      },
      atlassian: {
        baseUrl: atlassianBaseUrl,
        email: atlassianEmail,
        apiToken: atlassianApiToken,
      },
    };

    // Add Onyx config if API key is provided
    if (onyxApiKey) {
      config.onyx = {
        baseUrl: onyxBaseUrl || "https://api.onyx.app",
        apiKey: onyxApiKey,
      };
    }

    return config;
  }

  private isValidConfig(config: any): config is TapConfig {
    return (
      config &&
      config.github &&
      typeof config.github.token === "string" &&
      config.atlassian &&
      typeof config.atlassian.baseUrl === "string" &&
      typeof config.atlassian.email === "string" &&
      typeof config.atlassian.apiToken === "string"
    );
  }

  async testConnectivity(config?: TapConfig): Promise<boolean> {
    const testConfig = config || (await this.getConfig());

    console.log(chalk.yellow("🔍 Testing API connectivity..."));

    let allTestsPassed = true;

    // Test GitHub
    try {
      const response = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `token ${testConfig.github.token}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (response.ok) {
        const user = await response.json();
        console.log(chalk.green(`  ✅ GitHub API (${user.login})`));
      } else {
        console.log(chalk.red(`  ❌ GitHub API (HTTP ${response.status})`));
        allTestsPassed = false;
      }
    } catch {
      console.log(chalk.red("  ❌ GitHub API (Connection error)"));
      allTestsPassed = false;
    }

    // Test Atlassian
    try {
      const authHeader = `Basic ${Buffer.from(`${testConfig.atlassian.email}:${testConfig.atlassian.apiToken}`).toString("base64")}`;

      const response = await fetch(`${testConfig.atlassian.baseUrl}/rest/api/3/myself`, {
        headers: {
          Authorization: authHeader,
          Accept: "application/json",
        },
      });

      if (response.ok) {
        const user = await response.json();
        console.log(chalk.green(`  ✅ Atlassian API (${user.displayName})`));
      } else {
        console.log(chalk.red(`  ❌ Atlassian API (HTTP ${response.status})`));
        allTestsPassed = false;
      }
    } catch {
      console.log(chalk.red("  ❌ Atlassian API (Connection error)"));
      allTestsPassed = false;
    }

    // Test Onyx AI (optional)
    if (testConfig.onyx?.apiKey) {
      try {
        // Test Onyx AI connectivity with a simple query
        const onyxUrl = `${testConfig.onyx.baseUrl}/chat/send-message`;
        const response = await fetch(onyxUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${testConfig.onyx.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: "Hello",
            chat_session_id: null,
          }),
        });

        if (response.ok) {
          console.log(chalk.green("  ✅ Onyx AI API"));
        } else {
          console.log(chalk.red(`  ❌ Onyx AI API (HTTP ${response.status})`));
          console.log(chalk.gray("    Note: Onyx AI is optional for enhanced context"));
        }
      } catch {
        console.log(chalk.red("  ❌ Onyx AI API (Connection error)"));
        console.log(chalk.gray("    Note: Onyx AI is optional for enhanced context"));
      }
    } else {
      console.log(chalk.gray("  ⚪ Onyx AI API (not configured - optional)"));
    }

    if (!allTestsPassed) {
      console.log(
        chalk.yellow("\n⚠️  Some API connections failed. Commands may not work properly.")
      );
      console.log(chalk.gray("   Run 'tap setup --force' to reconfigure."));
    }

    return allTestsPassed;
  }

  // Helper method to get auth headers for GitHub
  async getGitHubAuthHeader(): Promise<string> {
    const config = await this.getConfig();
    return `token ${config.github.token}`;
  }

  // Helper method to get auth headers for Atlassian
  async getAtlassianAuthHeader(): Promise<string> {
    const config = await this.getConfig();
    return `Basic ${Buffer.from(`${config.atlassian.email}:${config.atlassian.apiToken}`).toString("base64")}`;
  }

  // Method for direct access to config (used by services)
  getLoadedConfig(): TapConfig {
    if (!this.config) {
      throw new Error("Config not loaded. Call getConfig() first.");
    }
    return this.config;
  }
}
