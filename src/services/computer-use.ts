import { exec } from "child_process";
import { promisify } from "util";
import { mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import chalk from "chalk";
// @ts-ignore - Bun supports importing text files
import cuaAgentScriptTemplate from "./cua_agent.py" with { type: "text" };

const execAsync = promisify(exec);

export interface PrerequisiteCheck {
  python: { available: boolean; path?: string; version?: string };
  docker: { available: boolean; version?: string };
}

export interface ExecutionReadinessCheck {
  ready: boolean;
  venvPath?: string;
  scriptPath?: string;
  dockerVersion?: string;
  missingComponents: {
    cuaVenv?: string;
    cuaScript?: string;
    docker?: string;
  };
}

export class ComputerUseService {
  private static instance: ComputerUseService;
  private cachedVenvPath?: string;
  private cachedPythonScriptPath?: string;
  private tapDir = join(homedir(), ".tap");
  private cuaDir = join(this.tapDir, "cua");
  private venvDir = join(this.cuaDir, "venv");

  static getInstance(): ComputerUseService {
    if (!ComputerUseService.instance) {
      ComputerUseService.instance = new ComputerUseService();
    }
    return ComputerUseService.instance;
  }

  /**
   * Resolve the path to the Python virtual environment
   */
  async resolveVenvPath(): Promise<string> {
    if (this.cachedVenvPath) {
      return this.cachedVenvPath;
    }

    if (existsSync(this.venvDir)) {
      const pythonPath = join(this.venvDir, "bin", "python");
      if (existsSync(pythonPath)) {
        this.cachedVenvPath = pythonPath;
        console.log(chalk.gray(`📍 CUA Python venv: ${pythonPath}`));
        return pythonPath;
      }
    }

    throw new Error("CUA virtual environment not found. Run 'tap setup' to install it.");
  }

  /**
   * Resolve the path to the CUA agent Python script
   */
  async resolveAgentScriptPath(): Promise<string> {
    if (this.cachedPythonScriptPath) {
      return this.cachedPythonScriptPath;
    }

    const scriptPath = join(this.cuaDir, "cua_agent.py");
    if (existsSync(scriptPath)) {
      this.cachedPythonScriptPath = scriptPath;
      console.log(chalk.gray(`📍 CUA agent script: ${scriptPath}`));
      return scriptPath;
    }

    throw new Error("CUA agent script not found. Run 'tap setup' to create it.");
  }

  /**
   * Sync the CUA agent script from source to cache location
   * This ensures the cached script is always up to date with the latest changes
   */
  async syncAgentScript(): Promise<void> {
    const scriptPath = join(this.cuaDir, "cua_agent.py");

    // Always write the latest version from the embedded template
    await mkdir(this.cuaDir, { recursive: true });
    await writeFile(scriptPath, cuaAgentScriptTemplate, "utf-8");

    // Update the cache
    this.cachedPythonScriptPath = scriptPath;
  }

  /**
   * Validate if the CUA installation is working
   * @throws Error if CUA packages cannot be imported with details about what failed
   */
  async validateCuaInstallation(): Promise<void> {
    const pythonPath = await this.resolveVenvPath();

    try {
      await execAsync(
        `${pythonPath} -c "from agent import ComputerAgent; from computer import Computer"`
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(
        `CUA installation validation failed: Cannot import CUA packages. ${errorMessage}`
      );
    }
  }

  /**
   * Check system prerequisites for CUA installation
   */
  async checkPrerequisites(): Promise<PrerequisiteCheck> {
    const result: PrerequisiteCheck = {
      python: { available: false },
      docker: { available: false },
    };

    // Check Python 3.10+
    const pythonCommands = [
      "python3.13",
      "python3.12",
      "python3.11",
      "python3.10",
      "python3",
      "python",
    ];

    for (const cmd of pythonCommands) {
      try {
        const { stdout } = await execAsync(`${cmd} --version`);
        const versionMatch = stdout.match(/Python (\d+\.\d+)/);
        if (versionMatch) {
          const version = versionMatch[1];
          const [major, minor] = version.split(".").map(Number);
          if (major === 3 && minor >= 10) {
            result.python = {
              available: true,
              path: cmd,
              version: stdout.trim(),
            };
            break;
          }
        }
      } catch {
        // Try next command
      }
    }

    // Check Docker
    try {
      const { stdout } = await execAsync("docker --version");
      result.docker = {
        available: true,
        version: stdout.trim(),
      };
    } catch {
      // Docker not available
    }

    return result;
  }

  /**
   * Install CUA and set up the Python virtual environment
   */
  async installCua(onProgress?: (message: string) => void): Promise<string> {
    const progress = onProgress || console.log;

    // Ensure TAP directory exists
    await mkdir(this.tapDir, { recursive: true });
    await mkdir(this.cuaDir, { recursive: true });

    // Check prerequisites
    const prereqs = await this.checkPrerequisites();
    if (!prereqs.python.available) {
      throw new Error("Python 3.10+ is required. Please install Python and try again.");
    }

    if (!prereqs.docker.available) {
      throw new Error(
        "Docker is required for CUA test execution. Please install Docker:\n" +
          "  • macOS: Install Docker Desktop (https://www.docker.com/products/docker-desktop)\n" +
          "  • Linux: sudo apt install docker.io (or equivalent for your distro)\n" +
          "  • Windows: Install Docker Desktop with WSL2 backend"
      );
    }

    const pythonCmd = prereqs.python.path!;

    // Create virtual environment
    if (!existsSync(this.venvDir)) {
      progress(chalk.blue("🔧 Creating Python virtual environment..."));
      try {
        await execAsync(`${pythonCmd} -m venv "${this.venvDir}"`);
        progress(chalk.green("✅ Virtual environment created"));
      } catch (error) {
        throw new Error(
          `Failed to create virtual environment: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } else {
      progress(chalk.blue("📦 Virtual environment already exists"));
    }

    const pythonPath = join(this.venvDir, "bin", "python");
    const pipPath = join(this.venvDir, "bin", "pip");

    // Upgrade pip
    progress(chalk.blue("📦 Upgrading pip..."));
    try {
      await execAsync(`${pipPath} install --upgrade pip`);
      progress(chalk.green("✅ pip upgraded"));
    } catch (error) {
      throw new Error(
        `Failed to upgrade pip: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Install/upgrade CUA packages and dependencies
    progress(chalk.blue("📥 Installing/upgrading CUA agent, computer packages, and dependencies..."));
    try {
      await execAsync(`${pipPath} install --upgrade "cua-agent[all]" cua-computer requests numpydoc`, {
        timeout: 5 * 60 * 1000, // 5 minutes timeout
      });
      progress(chalk.green("✅ CUA packages and dependencies installed/upgraded"));
    } catch (error) {
      throw new Error(
        `Failed to install CUA packages: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Create the CUA agent Python script
    progress(chalk.blue("📝 Creating CUA agent script..."));
    await this.createAgentScript();
    progress(chalk.green("✅ CUA agent script created"));

    // Validate installation (will throw if validation fails)
    await this.validateCuaInstallation();

    // Cache paths
    this.cachedVenvPath = pythonPath;

    progress(chalk.green("✅ CUA installation complete!"));

    return pythonPath;
  }

  /**
   * Create the Python agent script for executing test scenarios
   */
  private async createAgentScript(): Promise<void> {
    const scriptPath = join(this.cuaDir, "cua_agent.py");

    // Use the imported Python script template
    await writeFile(scriptPath, cuaAgentScriptTemplate, "utf-8");

    // No need for chmod - we execute via Python interpreter directly
    this.cachedPythonScriptPath = scriptPath;
  }

  /**
   * Get the directory where TAP manages the CUA installation
   */
  getCuaDirectory(): string {
    return this.cuaDir;
  }

  /**
   * Get the virtual environment directory
   */
  getVenvDirectory(): string {
    return this.venvDir;
  }

  /**
   * Comprehensive check for execution readiness
   * Validates that CUA is fully installed and Docker is available
   */
  async validateExecutionReadiness(): Promise<ExecutionReadinessCheck> {
    const result: ExecutionReadinessCheck = {
      ready: true,
      missingComponents: {},
    };

    // Check CUA venv
    try {
      result.venvPath = await this.resolveVenvPath();
    } catch (error) {
      result.ready = false;
      result.missingComponents.cuaVenv = error instanceof Error ? error.message : String(error);
    }

    // Check CUA agent script
    try {
      result.scriptPath = await this.resolveAgentScriptPath();
    } catch (error) {
      result.ready = false;
      result.missingComponents.cuaScript = error instanceof Error ? error.message : String(error);
    }

    // Check Docker
    const prerequisites = await this.checkPrerequisites();
    if (!prerequisites.docker.available) {
      result.ready = false;
      result.missingComponents.docker = "Docker is not installed or not running";
    } else {
      result.dockerVersion = prerequisites.docker.version;
    }

    return result;
  }

  /**
   * Validate execution readiness and display appropriate messages
   * Throws error if prerequisites are not met
   * @param verbose Whether to show detailed success messages
   * @throws Error with detailed information about missing prerequisites
   */
  async validateAndReportExecutionReadiness(verbose?: boolean): Promise<void> {
    if (verbose) {
      console.log(chalk.yellow("🔍 Validating test execution prerequisites..."));
    }

    // Sync the agent script from source to ensure latest version is used
    if (verbose) {
      console.log(chalk.gray("  📝 Syncing CUA agent script from source..."));
    }
    await this.syncAgentScript();

    const readiness = await this.validateExecutionReadiness();

    if (!readiness.ready) {
      console.error(chalk.red("❌ Prerequisites not met"));
      console.log("");

      // Build detailed error message
      const missingComponents: string[] = [];

      // Show specific missing components
      if (readiness.missingComponents.cuaVenv || readiness.missingComponents.cuaScript) {
        console.log(chalk.yellow("CUA (Computer Use Agent) is not installed:"));
        if (readiness.missingComponents.cuaVenv) {
          console.log(
            chalk.gray(`  • Virtual environment: ${readiness.missingComponents.cuaVenv}`)
          );
          missingComponents.push(`CUA venv: ${readiness.missingComponents.cuaVenv}`);
        }
        if (readiness.missingComponents.cuaScript) {
          console.log(chalk.gray(`  • Agent script: ${readiness.missingComponents.cuaScript}`));
          missingComponents.push(`CUA script: ${readiness.missingComponents.cuaScript}`);
        }
        console.log(chalk.yellow("\nPlease run 'tap setup' to install CUA automatically."));
        console.log("");
      }

      if (readiness.missingComponents.docker) {
        console.log(chalk.yellow("Docker is not available:"));
        console.log(chalk.gray(`  • ${readiness.missingComponents.docker}`));
        console.log(chalk.yellow("\nPlease install Docker first:"));
        console.log(
          chalk.gray(
            "  • macOS: Install Docker Desktop (https://www.docker.com/products/docker-desktop)"
          )
        );
        console.log(
          chalk.gray("  • Linux: sudo apt install docker.io (or equivalent for your distro)")
        );
        console.log(chalk.gray("  • Windows: Install Docker Desktop with WSL2 backend"));
        console.log("");
        missingComponents.push(`Docker: ${readiness.missingComponents.docker}`);
      }

      // Throw error with detailed information
      throw new Error(`CUA execution prerequisites not met: ${missingComponents.join(", ")}`);
    }

    // Log success in verbose mode
    if (verbose) {
      console.log(chalk.green(`  ✅ CUA venv: ${readiness.venvPath}`));
      console.log(chalk.green(`  ✅ CUA script: ${readiness.scriptPath}`));
      console.log(chalk.green(`  ✅ Docker: ${readiness.dockerVersion}`));
    }
  }
}
