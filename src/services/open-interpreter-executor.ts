import { TestScenario } from "./ai-test-generator";
import { PRAnalysis } from "./github";
import { TicketContext } from "./atlassian";
import { ContextExporter } from "./context-exporter";
import { InterpreterService } from "./interpreter";
import { ConfigService } from "./config";
import { mkdir, writeFile } from "fs/promises";
import { spawn } from "child_process";
import { existsSync } from "fs";

export interface TestResult {
  scenarioId: string;
  status: "passed" | "failed" | "warning" | "skipped";
  executionTime: number; // minutes
  steps: StepResult[];
  artifacts: Artifact[];
  notes: string;
  timestamp: string;
}

export interface StepResult {
  stepIndex: number;
  status: "passed" | "failed" | "warning";
  actualResult: string;
  screenshot?: string;
  duration: number; // seconds
}

export interface Artifact {
  type: "screenshot" | "video" | "log" | "document";
  path: string;
  description: string;
  timestamp: string;
}

export class OpenInterpreterExecutor {
  private contextExporter: ContextExporter;

  constructor() {
    this.contextExporter = new ContextExporter();
  }


  async executeScenarios(
    scenarios: TestScenario[],
    outputDir: string,
    context?: {
      prAnalysis?: PRAnalysis;
      jiraContext?: TicketContext | null;
      setupInstructions?: {
        baseSetupInstructions: string;
        prSpecificSetupInstructions?: string;
        sessionSetupInstructions?: string;
      };
    }
  ): Promise<TestResult[]> {
    if (!existsSync(outputDir)) {
      await mkdir(outputDir, { recursive: true });
    }

    const results: TestResult[] = [];
    console.log(`🤖 Executing ${scenarios.length} test scenarios with Open Interpreter...`);

    for (let i = 0; i < scenarios.length; i++) {
      const scenario = scenarios[i];
      console.log(`\n📋 Scenario ${i + 1}/${scenarios.length}: ${scenario.title}`);

      const result = await this.executeScenario(scenario, outputDir, context);
      results.push(result);

      // Brief pause between scenarios to allow for cleanup
      await this.delay(2000);
    }

    return results;
  }

  private async executeScenario(
    scenario: TestScenario,
    outputDir: string,
    context?: {
      prAnalysis?: PRAnalysis;
      jiraContext?: TicketContext | null;
      setupInstructions?: {
        baseSetupInstructions: string;
        prSpecificSetupInstructions?: string;
        sessionSetupInstructions?: string;
      };
    }
  ): Promise<TestResult> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    // Create organized directory structure
    const promptsDir = `${outputDir}/interpreter-prompts`;
    const resultsDir = `${outputDir}/interpreter-results`;
    await mkdir(promptsDir, { recursive: true });
    await mkdir(resultsDir, { recursive: true });

    const result: TestResult = {
      scenarioId: scenario.id,
      status: "passed",
      executionTime: 0,
      steps: [],
      artifacts: [],
      notes: "",
      timestamp,
    };

    try {
      console.log(`  📝 ${scenario.description}`);

      // Generate execution prompt using ContextExporter
      const executionPrompt = this.contextExporter.generateExecutionPrompt(scenario, context);

      // Create prompt file
      const promptFile = `${promptsDir}/${scenario.id}.txt`;
      await writeFile(promptFile, executionPrompt, "utf-8");

      // Execute with Open Interpreter
      console.log(`  🤖 Executing with Open Interpreter...`);
      const executionResult = await this.executeWithOpenInterpreter(executionPrompt, outputDir);

      // Parse execution results
      const parsedResults = this.parseExecutionResults(executionResult, scenario);
      result.steps = parsedResults.steps;
      result.status = parsedResults.status;
      result.notes = parsedResults.notes;

      // Collect artifacts from results directory
      result.artifacts = await this.collectArtifacts(resultsDir);

      // Save execution result to file
      const resultFile = `${resultsDir}/${scenario.id}.txt`;
      await writeFile(resultFile, executionResult, "utf-8");

      const duration = (Date.now() - startTime) / 1000 / 60; // Convert to minutes
      result.executionTime = Math.round(duration * 100) / 100;

      console.log(`    ✅ Completed in ${result.executionTime} minutes (${result.status})`);
    } catch (error) {
      result.status = "failed";
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.notes = `Execution failed: ${errorMessage}`;
      console.log(`    ❌ Failed: ${errorMessage}`);
    }

    return result;
  }

  private async executeWithOpenInterpreter(prompt: string, workingDir: string): Promise<string> {
    try {
      const interpreterService = InterpreterService.getInstance();
      const interpreterPath = await interpreterService.resolveInterpreterPath();

      console.log(`    🔧 Running: ${interpreterPath} --os --model claude-3.5-sonnet --auto_run --stdin`);

      const configService = ConfigService.getInstance();
      const anthropicApiKey = await configService.getAnthropicApiKey();
      
      if (!anthropicApiKey) {
        throw new Error(
          "ANTHROPIC_API_KEY not found. Please configure it via 'tap setup' or set the ANTHROPIC_API_KEY environment variable."
        );
      }

      // Build environment variables for interpreter
      const interpreterEnv: Record<string, string> = {
        ANTHROPIC_API_KEY: anthropicApiKey,
      };

      // Add SSL_CERT_FILE if set (needed for corporate environments)
      if (process.env.SSL_CERT_FILE) {
        interpreterEnv.SSL_CERT_FILE = process.env.SSL_CERT_FILE;
      }

      return new Promise((resolve, reject) => {
        const child = spawn(interpreterPath, ['--os', '--model', 'claude-3.5-sonnet', '--auto_run', '--stdin'], {
          cwd: workingDir,
          env: interpreterEnv,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        // Set up timeout
        const timeout = setTimeout(() => {
          child.kill('SIGTERM');
          reject(new Error('Open Interpreter execution timed out after 10 minutes'));
        }, 10 * 60 * 1000); // 10 minutes timeout

        child.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('close', async (code) => {
          clearTimeout(timeout);
          
          try {
            // Save execution logs
            await writeFile(`${workingDir}/execution-stdout.log`, stdout, "utf-8");
            if (stderr) {
              await writeFile(`${workingDir}/execution-stderr.log`, stderr, "utf-8");
            }

            if (code === 0) {
              resolve(stdout);
            } else {
              reject(new Error(`Open Interpreter exited with code ${code}. stderr: ${stderr}`));
            }
          } catch (writeError) {
            reject(writeError);
          }
        });

        child.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });

        // Write prompt to stdin and close it
        child.stdin?.write(prompt);
        child.stdin?.end();
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`    ⚠️  Open Interpreter error: ${errorMessage}`);
      throw error;
    }
  }

  private parseExecutionResults(
    output: string,
    scenario: TestScenario
  ): {
    steps: StepResult[];
    status: "passed" | "failed" | "warning";
    notes: string;
  } {
    const steps: StepResult[] = [];
    let overallStatus: "passed" | "failed" | "warning" = "passed";
    let notes = "";

    // Create step results based on scenario steps
    // This is a simplified parser - in a real implementation, you'd parse Open Interpreter's output more thoroughly
    scenario.steps.forEach((step, index) => {
      const stepResult: StepResult = {
        stepIndex: index,
        status: "passed", // Default to passed, could be enhanced with output parsing
        actualResult: `Executed ${step.action}${step.target ? ` on ${step.target}` : ""}`,
        duration: 2, // Placeholder duration
      };

      steps.push(stepResult);
    });

    // Parse output for errors or warnings
    if (output.toLowerCase().includes("error") || output.toLowerCase().includes("failed")) {
      overallStatus = "failed";
      notes = "Execution encountered errors. See logs for details.";
    } else if (output.toLowerCase().includes("warning")) {
      overallStatus = "warning";
      notes = "Execution completed with warnings. See logs for details.";
    } else {
      overallStatus = "passed";
      notes = "Execution completed successfully.";
    }

    return { steps, status: overallStatus, notes };
  }

  private async collectArtifacts(scenarioDir: string): Promise<Artifact[]> {
    const artifacts: Artifact[] = [];

    try {
      // Look for common artifact types
      const { readdir } = await import("fs/promises");
      const files = await readdir(scenarioDir);

      for (const file of files) {
        const filePath = `${scenarioDir}/${file}`;
        const timestamp = new Date().toISOString();

        if (file.endsWith(".png") || file.endsWith(".jpg") || file.endsWith(".jpeg")) {
          artifacts.push({
            type: "screenshot",
            path: filePath,
            description: `Screenshot: ${file}`,
            timestamp,
          });
        } else if (file.endsWith(".mp4") || file.endsWith(".mov")) {
          artifacts.push({
            type: "video",
            path: filePath,
            description: `Video recording: ${file}`,
            timestamp,
          });
        } else if (file.endsWith(".log") || file.endsWith(".txt")) {
          artifacts.push({
            type: "log",
            path: filePath,
            description: `Log file: ${file}`,
            timestamp,
          });
        } else if (file.endsWith(".pdf") || file.endsWith(".doc") || file.endsWith(".docx")) {
          artifacts.push({
            type: "document",
            path: filePath,
            description: `Document: ${file}`,
            timestamp,
          });
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not collect artifacts from ${scenarioDir}:`, error);
    }

    return artifacts;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
