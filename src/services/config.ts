import { readFile, access, writeFile, mkdir, chmod } from "fs/promises";
import { homedir } from "os";
import { join, dirname } from "path";
import chalk from "chalk";

export interface TapConfig {
  githubToken: string;
  atlassianBaseUrl: string;
  atlassianEmail: string;
  atlassianApiToken: string;
  appSetupInstructions: string;
  anthropicApiKey?: string;
  onyxBaseUrl?: string;
  onyxApiKey?: string;
}

// Environment variable mapping with all supported fields
const ENV_MAPPING = {
  githubToken: "GITHUB_TOKEN",
  atlassianBaseUrl: "ATLASSIAN_BASE_URL",
  atlassianEmail: "ATLASSIAN_EMAIL",
  atlassianApiToken: "ATLASSIAN_API_TOKEN",
  onyxBaseUrl: "ONYX_BASE_URL",
  onyxApiKey: "ONYX_API_KEY",
  anthropicApiKey: "ANTHROPIC_API_KEY",
  appSetupInstructions: "TAP_APP_SETUP_INSTRUCTIONS",
} as const;

export type ConfigFieldName = keyof typeof ENV_MAPPING;

export interface ConfigFieldStatus {
  fromEnv: boolean;
  fromConfig: boolean;
  currentValue?: string; // masked for sensitive fields
  envVarName?: string;
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
    // Load config file values (partial config is OK)
    const configFromFile = await this.loadFromConfigFile();

    // Load environment variable values
    const envValues = this.loadEnvironmentValues();

    // Merge config file and environment variables (env vars take precedence)
    const mergedConfig: TapConfig = {
      githubToken: envValues.githubToken || configFromFile?.githubToken || "",
      atlassianBaseUrl: envValues.atlassianBaseUrl || configFromFile?.atlassianBaseUrl || "",
      atlassianEmail: envValues.atlassianEmail || configFromFile?.atlassianEmail || "",
      atlassianApiToken: envValues.atlassianApiToken || configFromFile?.atlassianApiToken || "",
      appSetupInstructions:
        envValues.appSetupInstructions || configFromFile?.appSetupInstructions || "",
      anthropicApiKey: envValues.anthropicApiKey || configFromFile?.anthropicApiKey,
      onyxBaseUrl: envValues.onyxBaseUrl || configFromFile?.onyxBaseUrl,
      onyxApiKey: envValues.onyxApiKey || configFromFile?.onyxApiKey,
    };

    // Validate that required fields are present and show specific missing ones
    const missingFields: string[] = [];
    if (!mergedConfig.githubToken) missingFields.push("GITHUB_TOKEN");
    if (!mergedConfig.atlassianBaseUrl) missingFields.push("ATLASSIAN_BASE_URL");
    if (!mergedConfig.atlassianEmail) missingFields.push("ATLASSIAN_EMAIL");
    if (!mergedConfig.atlassianApiToken) missingFields.push("ATLASSIAN_API_TOKEN");

    if (missingFields.length > 0) {
      throw new Error(
        `Missing required configuration fields: ${missingFields.join(", ")}\n\n` +
          "Please run 'tap setup' or set the missing environment variables:\n" +
          missingFields.map((field) => `  • ${field}`).join("\n") +
          "\n\nOptional environment variables:\n" +
          "  • ONYX_BASE_URL (for self-hosted Onyx instances)\n" +
          "  • ONYX_API_KEY (for enhanced product context)\n" +
          "  • TAP_APP_SETUP_INSTRUCTIONS (app setup instructions)\n" +
          "  • ANTHROPIC_API_KEY (required for test execution)\n" +
          "\nInstall dependencies:\n" +
          "  • Claude CLI for AI test generation: npm install -g @anthropic-ai/claude-cli\n" +
          "  • CUA (Computer Use Agent): Run 'tap setup' for automatic installation"
      );
    }

    return mergedConfig;
  }

  private async loadFromConfigFile(): Promise<TapConfig | null> {
    try {
      const configPath = `${homedir()}/.tap/config.json`;
      await access(configPath);
      const configContent = await readFile(configPath, "utf-8");
      const config = JSON.parse(configContent);

      // Return the config even if partially valid - we'll merge with env vars
      return config;
    } catch {
      return null;
    }
  }

  private loadEnvironmentValues(): Partial<TapConfig> {
    return {
      githubToken: process.env.GITHUB_TOKEN,
      atlassianBaseUrl: process.env.ATLASSIAN_BASE_URL,
      atlassianEmail: process.env.ATLASSIAN_EMAIL,
      atlassianApiToken: process.env.ATLASSIAN_API_TOKEN,
      appSetupInstructions: process.env.TAP_APP_SETUP_INSTRUCTIONS,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      onyxBaseUrl: process.env.ONYX_BASE_URL,
      onyxApiKey: process.env.ONYX_API_KEY,
    };
  }

  private isValidConfig(config: any): config is TapConfig {
    return (
      config &&
      typeof config.githubToken === "string" &&
      typeof config.atlassianBaseUrl === "string" &&
      typeof config.atlassianEmail === "string" &&
      typeof config.atlassianApiToken === "string" &&
      typeof config.appSetupInstructions === "string"
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
          Authorization: `token ${testConfig.githubToken}`,
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
      const authHeader = `Basic ${Buffer.from(`${testConfig.atlassianEmail}:${testConfig.atlassianApiToken}`).toString("base64")}`;

      const response = await fetch(`${testConfig.atlassianBaseUrl}/rest/api/3/myself`, {
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
    if (testConfig.onyxApiKey) {
      try {
        // Test Onyx AI connectivity with a simple query
        const onyxUrl = `${testConfig.onyxBaseUrl || "https://api.onyx.app"}/chat/send-message`;
        const response = await fetch(onyxUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${testConfig.onyxApiKey}`,
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
    return `token ${config.githubToken}`;
  }

  // Helper method to get auth headers for Atlassian
  async getAtlassianAuthHeader(): Promise<string> {
    const config = await this.getConfig();
    return `Basic ${Buffer.from(`${config.atlassianEmail}:${config.atlassianApiToken}`).toString("base64")}`;
  }

  // Method for direct access to config (used by services)
  getLoadedConfig(): TapConfig {
    if (!this.config) {
      throw new Error("Config not loaded. Call getConfig() first.");
    }
    return this.config;
  }

  // Get app setup instructions
  async getAppSetupInstructions(): Promise<string> {
    const config = await this.getConfig();
    return config.appSetupInstructions;
  }

  // Get Anthropic API key (checks environment variable first, then config)
  async getAnthropicApiKey(): Promise<string | null> {
    // First check environment variable
    const envApiKey = process.env.ANTHROPIC_API_KEY;
    if (envApiKey) {
      return envApiKey;
    }

    // Then check config
    const config = await this.getConfig();
    return config.anthropicApiKey || null;
  }

  // Get configuration field status (env vs config file)
  async getFieldStatus(field: ConfigFieldName): Promise<ConfigFieldStatus> {
    const envVarName = ENV_MAPPING[field];
    const fromEnv = !!process.env[envVarName];

    // Get config file values without loading full config
    const configFileValues = await this.getConfigFileValues();
    let fromConfig = false;
    let currentValue: string | undefined;

    if (configFileValues) {
      const fieldValue = configFileValues[field];
      fromConfig = !!fieldValue;

      if (fromConfig) {
        // Define sensitive fields that should be masked
        const sensitiveFields: ConfigFieldName[] = [
          "githubToken",
          "atlassianApiToken",
          "onyxApiKey",
          "anthropicApiKey",
        ];

        if (sensitiveFields.includes(field)) {
          currentValue = "***";
        } else {
          currentValue = fieldValue;
        }
      }
    }

    return {
      fromEnv,
      fromConfig,
      currentValue,
      envVarName,
    };
  }

  // Get config file values only (without env fallback)
  async getConfigFileValues(): Promise<Partial<TapConfig> | null> {
    try {
      const configPath = `${homedir()}/.tap/config.json`;
      await access(configPath);
      const configContent = await readFile(configPath, "utf-8");
      const config = JSON.parse(configContent);
      return config;
    } catch {
      return null;
    }
  }

  // Filter out environment variables from config object
  static filterEnvVariables(config: any): any {
    const filteredConfig: any = { ...config };

    // Remove fields that have corresponding environment variables
    if (process.env.GITHUB_TOKEN) delete filteredConfig.githubToken;
    if (process.env.ATLASSIAN_BASE_URL) delete filteredConfig.atlassianBaseUrl;
    if (process.env.ATLASSIAN_EMAIL) delete filteredConfig.atlassianEmail;
    if (process.env.ATLASSIAN_API_TOKEN) delete filteredConfig.atlassianApiToken;
    if (process.env.TAP_APP_SETUP_INSTRUCTIONS) delete filteredConfig.appSetupInstructions;
    if (process.env.ANTHROPIC_API_KEY) delete filteredConfig.anthropicApiKey;
    if (process.env.ONYX_BASE_URL) delete filteredConfig.onyxBaseUrl;
    if (process.env.ONYX_API_KEY) delete filteredConfig.onyxApiKey;

    return filteredConfig;
  }

  // Write config to file (filtering out environment variables)
  static async writeConfigFile(config: any): Promise<string> {
    const configPath = join(homedir(), ".tap", "config.json");
    const filteredConfig = ConfigService.filterEnvVariables(config);

    // Ensure directory exists
    await mkdir(dirname(configPath), { recursive: true });

    // Write config file with proper permissions
    await writeFile(configPath, JSON.stringify(filteredConfig, null, 2), "utf-8");
    await chmod(configPath, 0o600);

    return configPath;
  }

  // Save config to file (filtering out environment variables)
  private async saveConfig(config: TapConfig): Promise<void> {
    await ConfigService.writeConfigFile(config);
  }

  /**
   * Validate that Anthropic API key is configured and display appropriate messages
   * Throws error if API key is not found
   * @param verbose Whether to show success message
   * @throws Error if ANTHROPIC_API_KEY is not configured
   */
  async validateAnthropicApiKey(verbose?: boolean): Promise<void> {
    const anthropicApiKey = await this.getAnthropicApiKey();

    if (!anthropicApiKey) {
      console.error(chalk.red("❌ ANTHROPIC_API_KEY not found"));
      console.log(chalk.yellow("CUA requires an Anthropic API key for test execution."));
      console.log(chalk.yellow("Please configure your API key:"));
      console.log(chalk.gray("  1. Run 'tap setup' and configure it during setup, OR"));
      console.log(
        chalk.gray("  2. Set environment variable: export ANTHROPIC_API_KEY=your_api_key_here")
      );
      console.log(chalk.gray("Get your API key from: https://console.anthropic.com/"));

      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    if (verbose) {
      console.log(chalk.green("  ✅ ANTHROPIC_API_KEY configured"));
    }
  }
}
