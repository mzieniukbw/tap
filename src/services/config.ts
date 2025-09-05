import { readFile, access, writeFile, mkdir, chmod } from "fs/promises";
import { homedir } from "os";
import { join, dirname } from "path";
import chalk from "chalk";
import { InterpreterInfo } from "./interpreter";

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
  openInterpreter?: InterpreterInfo;
  appSetupInstructions: string;
  anthropicApiKey?: string;
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
    const onyxBaseUrl = process.env.ONYX_BASE_URL;
    const onyxApiKey = process.env.ONYX_API_KEY;
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

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
      appSetupInstructions: process.env.TAP_APP_SETUP_INSTRUCTIONS || "",
    };

    // Add Onyx config if API key is provided
    if (onyxApiKey) {
      config.onyx = {
        baseUrl: onyxBaseUrl || "https://api.onyx.app",
        apiKey: onyxApiKey,
      };
    }

    // Add Anthropic API key if provided
    if (anthropicApiKey) {
      config.anthropicApiKey = anthropicApiKey;
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
      typeof config.atlassian.apiToken === "string" &&
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

  // Get Open Interpreter configuration
  async getOpenInterpreterConfig(): Promise<InterpreterInfo | null> {
    const config = await this.getConfig();
    return config.openInterpreter || null;
  }

  // Save Open Interpreter configuration
  async saveOpenInterpreterConfig(interpreterInfo: InterpreterInfo): Promise<void> {
    const config = await this.getConfig();
    config.openInterpreter = interpreterInfo;

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
      switch (field) {
        case "githubToken":
          fromConfig = !!configFileValues.github?.token;
          currentValue = fromConfig ? "***" : undefined;
          break;
        case "atlassianBaseUrl":
          fromConfig = !!configFileValues.atlassian?.baseUrl;
          currentValue = configFileValues.atlassian?.baseUrl;
          break;
        case "atlassianEmail":
          fromConfig = !!configFileValues.atlassian?.email;
          currentValue = configFileValues.atlassian?.email;
          break;
        case "atlassianApiToken":
          fromConfig = !!configFileValues.atlassian?.apiToken;
          currentValue = fromConfig ? "***" : undefined;
          break;
        case "onyxBaseUrl":
          fromConfig = !!configFileValues.onyx?.baseUrl;
          currentValue = configFileValues.onyx?.baseUrl;
          break;
        case "onyxApiKey":
          fromConfig = !!configFileValues.onyx?.apiKey;
          currentValue = fromConfig ? "***" : undefined;
          break;
        case "anthropicApiKey":
          fromConfig = !!configFileValues.anthropicApiKey;
          currentValue = fromConfig ? "***" : undefined;
          break;
        case "appSetupInstructions":
          fromConfig = !!configFileValues.appSetupInstructions;
          currentValue = fromConfig ? "(configured)" : undefined;
          break;
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

    // Remove GitHub config if env var exists
    if (process.env.GITHUB_TOKEN && filteredConfig.github) {
      delete filteredConfig.github;
    }

    // Handle Atlassian config
    if (filteredConfig.atlassian) {
      if (process.env.ATLASSIAN_BASE_URL) {
        delete filteredConfig.atlassian.baseUrl;
      }
      if (process.env.ATLASSIAN_EMAIL) {
        delete filteredConfig.atlassian.email;
      }
      if (process.env.ATLASSIAN_API_TOKEN) {
        delete filteredConfig.atlassian.apiToken;
      }
      // Clean up empty atlassian object
      if (!filteredConfig.atlassian.baseUrl && !filteredConfig.atlassian.email && !filteredConfig.atlassian.apiToken) {
        delete filteredConfig.atlassian;
      }
    }

    // Remove app setup instructions if env var exists
    if (process.env.TAP_APP_SETUP_INSTRUCTIONS) {
      delete filteredConfig.appSetupInstructions;
    }

    // Remove Anthropic API key if env var exists
    if (process.env.ANTHROPIC_API_KEY) {
      delete filteredConfig.anthropicApiKey;
    }

    // Handle Onyx config
    if (filteredConfig.onyx) {
      if (process.env.ONYX_BASE_URL) {
        delete filteredConfig.onyx.baseUrl;
      }
      if (process.env.ONYX_API_KEY) {
        delete filteredConfig.onyx.apiKey;
      }
      // Clean up empty onyx object
      if (!filteredConfig.onyx.baseUrl && !filteredConfig.onyx.apiKey) {
        delete filteredConfig.onyx;
      }
    }

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
