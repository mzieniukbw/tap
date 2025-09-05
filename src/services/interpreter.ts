import { exec } from "child_process";
import { promisify } from "util";
import { mkdir } from "fs/promises";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import chalk from "chalk";

const execAsync = promisify(exec);

export interface PrerequisiteCheck {
  python311: { available: boolean; path?: string; version?: string };
  poetry: { available: boolean; path?: string; version?: string };
}

export class InterpreterService {
  private static instance: InterpreterService;
  private cachedPath?: string;
  private tapDir = join(homedir(), ".tap");
  private interpreterDir = join(this.tapDir, "open-interpreter");
  private interpreterBinary = join(this.interpreterDir, ".venv", "bin", "interpreter");

  static getInstance(): InterpreterService {
    if (!InterpreterService.instance) {
      InterpreterService.instance = new InterpreterService();
    }
    return InterpreterService.instance;
  }

  /**
   * Resolve the path to the Open Interpreter executable
   * Priority: OPEN_INTERPRETER_PATH env var > TAP config > global command
   */
  async resolveInterpreterPath(): Promise<string> {
    if (this.cachedPath) {
      return this.cachedPath;
    }

    // 1. Check environment variable (highest priority)
    const envPath = process.env.OPEN_INTERPRETER_PATH;
    if (envPath) {
      if (await this.validateInterpreterPath(envPath)) {
        this.cachedPath = envPath;
        return envPath;
      } else {
        console.warn(
          chalk.yellow(`⚠️  OPEN_INTERPRETER_PATH points to invalid interpreter: ${envPath}`)
        );
      }
    }

    // 2. Check TAP config
    const configPath = await this.getConfiguredPath();
    if (configPath && (await this.validateInterpreterPath(configPath))) {
      this.cachedPath = configPath;
      return configPath;
    }

    // 3. Check TAP-managed installation
    const tapManagedPath = await this.getTapManagedInterpreterPath();
    if (tapManagedPath && (await this.validateInterpreterPath(tapManagedPath))) {
      this.cachedPath = tapManagedPath;
      await this.saveToConfigIfNotFromEnv(tapManagedPath);
      return tapManagedPath;
    }

    // 4. Fall back to global command
    if (await this.validateInterpreterPath("interpreter")) {
      this.cachedPath = "interpreter";
      await this.saveToConfigIfNotFromEnv("interpreter");
      return "interpreter";
    }

    throw new Error(
      "Open Interpreter not found. Run 'tap setup' to install it automatically or set OPEN_INTERPRETER_PATH."
    );
  }

  /**
   * Validate if a given path points to a working Open Interpreter installation
   */
  async validateInterpreterPath(path: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`${path} --version`);
      return stdout.includes("Open Interpreter");
    } catch {
      return false;
    }
  }

  /**
   * Check system prerequisites for Open Interpreter installation
   */
  async checkPrerequisites(): Promise<PrerequisiteCheck> {
    const result: PrerequisiteCheck = {
      python311: { available: false },
      poetry: { available: false },
    };

    // Check Python 3.11
    try {
      // Try python3.11 first
      const { stdout } = await execAsync("python3.11 --version");
      if (stdout.includes("3.11")) {
        result.python311 = {
          available: true,
          path: "python3.11",
          version: stdout.trim(),
        };
      }
    } catch {
      try {
        // Try python as fallback
        const { stdout } = await execAsync("python --version");
        if (stdout.includes("3.11")) {
          result.python311 = {
            available: true,
            path: "python",
            version: stdout.trim(),
          };
        }
      } catch {
        // Python not available
      }
    }

    // Check Poetry
    try {
      const { stdout } = await execAsync("poetry --version");
      result.poetry = {
        available: true,
        path: "poetry",
        version: stdout.trim(),
      };
    } catch {
      // Poetry not available
    }

    return result;
  }

  /**
   * Install Open Interpreter with OS capabilities to ~/.tap/open-interpreter
   */
  async installOpenInterpreter(onProgress?: (message: string) => void): Promise<string> {
    const progress = onProgress || console.log;

    // Ensure TAP directory exists
    await mkdir(this.tapDir, { recursive: true });

    // Check if repository already exists
    if (existsSync(this.interpreterDir)) {
      progress(chalk.blue("🔄 Updating existing Open Interpreter repository..."));

      try {
        await execAsync("git pull origin main", { cwd: this.interpreterDir });
        progress(chalk.green("✅ Repository updated"));
      } catch (error) {
        throw new Error(
          `Failed to update existing Open Interpreter repository: ${error instanceof Error ? error.message : String(error)}. ` +
            `Please manually remove ${this.interpreterDir} and run setup again.`
        );
      }
    } else {
      progress(chalk.blue("📥 Cloning Open Interpreter repository..."));

      try {
        await execAsync(
          `git clone https://github.com/openinterpreter/open-interpreter.git "${this.interpreterDir}"`
        );
        progress(chalk.green("✅ Repository cloned"));
      } catch (error) {
        throw new Error(
          `Failed to clone Open Interpreter repository: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    progress(chalk.blue("🔧 Setting up Poetry environment..."));

    // Configure Poetry to create venv in project directory and use Python 3.11
    try {
      await execAsync("poetry config virtualenvs.in-project true", { cwd: this.interpreterDir });
      await execAsync("poetry env use 3.11", { cwd: this.interpreterDir });
      progress(chalk.green("✅ Poetry environment configured"));
    } catch (error) {
      throw new Error(
        `Failed to configure Poetry environment: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Get the actual virtual environment path
    let venvPath: string;
    try {
      const { stdout } = await execAsync("poetry env info --path", { cwd: this.interpreterDir });
      venvPath = stdout.trim();
      progress(chalk.gray(`Virtual environment path: ${venvPath}`));
    } catch (error) {
      throw new Error(
        `Failed to get Poetry virtual environment path: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    progress(chalk.blue("🔒 Updating Poetry lock file..."));

    // Update lock file first in case pyproject.toml changed
    try {
      await execAsync("poetry lock", {
        cwd: this.interpreterDir,
        timeout: 5 * 60 * 1000, // 5 minutes timeout
      });
      progress(chalk.green("✅ Poetry lock file updated"));
    } catch (error) {
      throw new Error(
        `Failed to update Poetry lock file: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    progress(chalk.blue("📦 Installing Open Interpreter with OS capabilities..."));

    // Install with OS extras
    try {
      await execAsync('poetry install --extras "os"', {
        cwd: this.interpreterDir,
        timeout: 5 * 60 * 1000, // 5 minutes timeout
      });
      progress(chalk.green("✅ Open Interpreter installed"));
    } catch (error) {
      throw new Error(
        `Failed to install Open Interpreter: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Build the actual interpreter path using the detected venv
    const actualInterpreterPath = join(venvPath, "bin", "interpreter");

    // Validate installation
    if (!(await this.validateInterpreterPath(actualInterpreterPath))) {
      throw new Error("Installation completed but interpreter binary is not working");
    }

    // Cache the actual path
    this.cachedPath = actualInterpreterPath;

    progress(chalk.green("✅ Open Interpreter installation complete!"));

    return actualInterpreterPath;
  }

  /**
   * Check if TAP-managed installation exists and is working
   */
  async hasTapManagedInstallation(): Promise<boolean> {
    return (
      existsSync(this.interpreterBinary) &&
      (await this.validateInterpreterPath(this.interpreterBinary))
    );
  }

  /**
   * Get configured interpreter path from TAP config
   */
  private async getConfiguredPath(): Promise<string | null> {
    try {
      const { ConfigService } = await import("./config");
      const configService = ConfigService.getInstance();
      return await configService.getOpenInterpreterPath();
    } catch {
      // Config not available or not configured
      return null;
    }
  }

  /**
   * Get TAP-managed interpreter path by detecting Poetry venv
   */
  private async getTapManagedInterpreterPath(): Promise<string | null> {
    try {
      // Check if TAP interpreter directory exists
      if (!existsSync(this.interpreterDir)) {
        return null;
      }

      // Get the actual venv path from Poetry
      const { stdout } = await execAsync("poetry env info --path", { cwd: this.interpreterDir });
      const venvPath = stdout.trim();

      // Build interpreter path
      const interpreterPath = join(venvPath, "bin", "interpreter");

      return interpreterPath;
    } catch {
      // Poetry not available or no venv configured
      return null;
    }
  }

  /**
   * Save interpreter path to config if not using environment variable
   */
  private async saveToConfigIfNotFromEnv(interpreterPath: string): Promise<void> {
    try {
      // Don't save if using environment variable
      if (process.env.OPEN_INTERPRETER_PATH) {
        return;
      }

      const { ConfigService } = await import("./config");
      const configService = ConfigService.getInstance();
      await configService.saveOpenInterpreterPath(interpreterPath);
    } catch (error) {
      // Config saving failed, but don't break the flow
      console.warn(
        chalk.yellow(
          `⚠️  Failed to save interpreter path to config: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  }

  /**
   * Clear cached path (useful for testing or after configuration changes)
   */
  clearCache(): void {
    this.cachedPath = undefined;
  }

  /**
   * Get the directory where TAP manages the Open Interpreter installation
   */
  getTapInterpreterDirectory(): string {
    return this.interpreterDir;
  }

  /**
   * Remove TAP-managed Open Interpreter installation
   */
  async uninstall(): Promise<void> {
    if (existsSync(this.interpreterDir)) {
      await execAsync(`rm -rf "${this.interpreterDir}"`);
      this.clearCache();
    }
  }
}
