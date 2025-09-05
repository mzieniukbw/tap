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
  openInterpreter?: string;
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
  openInterpreter: "OPEN_INTERPRETER_PATH",
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
        "  • TAP_APP_SETUP_INSTRUCTIONS (optional - app setup instructions)\n" +
        "  • ANTHROPIC_API_KEY (required for test execution)\n" +
        "  • OPEN_INTERPRETER_PATH (optional - path to interpreter binary)\n" +
        "\nInstall dependencies:\n" +
        "  • Claude CLI for AI test generation: npm install -g @anthropic-ai/claude-cli\n" +
        "  • Open Interpreter: Run 'tap setup' for automatic installation"
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

    if (!githubToken || !atlassianBaseUrl || !atlassianEmail || !atlassianApiToken) {
      return null;
    }

    const config: TapConfig = {
      githubToken,
      atlassianBaseUrl,
      atlassianEmail,
      atlassianApiToken,
      appSetupInstructions: process.env.TAP_APP_SETUP_INSTRUCTIONS || "",
    };

    // Add optional fields if provided
    if (process.env.ONYX_BASE_URL) {
      config.onyxBaseUrl = process.env.ONYX_BASE_URL;
    }
    if (process.env.ONYX_API_KEY) {
      config.onyxApiKey = process.env.ONYX_API_KEY;
    }
    if (process.env.ANTHROPIC_API_KEY) {
      config.anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    }
    if (process.env.OPEN_INTERPRETER_PATH) {
      config.openInterpreter = process.env.OPEN_INTERPRETER_PATH;
    }

    return config;
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

  // Get Open Interpreter path
  async getOpenInterpreterPath(): Promise<string | null> {
    const config = await this.getConfig();
    return config.openInterpreter || null;
  }

  // Save Open Interpreter path
  async saveOpenInterpreterPath(interpreterPath: string): Promise<void> {
    const config = await this.getConfig();
    config.openInterpreter = interpreterPath;

    await this.saveConfig(config);
    this.config = config; // Update cached config
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
          "anthropicApiKey"
        ];

        if (sensitiveFields.includes(field)) {
          currentValue = "***";
        } else if (field === "appSetupInstructions") {
          currentValue = "(configured)";
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
    if (process.env.OPEN_INTERPRETER_PATH) delete filteredConfig.openInterpreter;

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
}
