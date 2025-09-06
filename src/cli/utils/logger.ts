import chalk from "chalk";
import { createInterface } from "readline";
import ora from "ora";
import type { Ora } from "ora";
import boxen from "boxen";
import gradient from "gradient-string";
import figlet from "figlet";
import cliProgress from "cli-progress";
import Table from "cli-table3";
import { performance } from "perf_hooks";
import type { ExecutionPlan } from "../types";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Agent operation tracking
interface AgentOperation {
  id: string;
  type:
    | "file-read"
    | "file-write"
    | "code-generation"
    | "analysis"
    | "migration"
    | "execution";
  description: string;
  startTime: number;
  endTime?: number;
  status: "pending" | "running" | "completed" | "error";
  details?: any;
  filePath?: string;
  generatedCode?: string;
}

class AgentLogger {
  private operations: Map<string, AgentOperation> = new Map();
  private currentSpinner?: Ora;
  private progressBar?: cliProgress.SingleBar;
  private operationCounter = 0;

  constructor() {
    this.showBanner();
  }

  private showBanner(): void {
    console.clear();
    const title = figlet.textSync("AGENT", {
      font: "ANSI Shadow",
      horizontalLayout: "fitted",
    });

    console.log(gradient.rainbow(title));
    console.log(chalk.dim("━".repeat(80)));
    console.log(chalk.cyan.bold("🤖 AI Agent Activity Monitor"));
    console.log(
      chalk.dim("Tracking all operations with beautiful visual feedback\n")
    );
  }

  startOperation(
    type: AgentOperation["type"],
    description: string,
    filePath?: string
  ): string {
    const id = `op-${++this.operationCounter}`;
    const operation: AgentOperation = {
      id,
      type,
      description,
      startTime: performance.now(),
      status: "running",
      filePath,
    };

    this.operations.set(id, operation);
    this.displayOperationStart(operation);
    return id;
  }

  private displayOperationStart(operation: AgentOperation): void {
    const icon = this.getOperationIcon(operation.type);
    const colorFn = this.getOperationColorFunction(operation.type);

    this.currentSpinner = ora({
      text: colorFn(`${icon} ${operation.description}`),
      spinner: "dots12",
    }).start();

    if (operation.filePath) {
      this.currentSpinner.text += chalk.dim(` → ${operation.filePath}`);
    }
  }

  updateOperation(id: string, updates: Partial<AgentOperation>): void {
    const operation = this.operations.get(id);
    if (!operation) return;

    Object.assign(operation, updates);

    if (operation.status === "completed") {
      operation.endTime = performance.now();
      this.displayOperationComplete(operation);
    } else if (operation.status === "error") {
      this.displayOperationError(operation);
    }
  }

  private displayOperationComplete(operation: AgentOperation): void {
    if (this.currentSpinner) {
      const duration = operation.endTime! - operation.startTime;
      const icon = this.getOperationIcon(operation.type);
      const colorFn = this.getOperationColorFunction(operation.type);

      this.currentSpinner.succeed(
        colorFn(`${icon} ${operation.description}`) +
          chalk.dim(` (${Math.round(duration)}ms)`)
      );
    }

    // Show additional details based on operation type
    this.displayOperationDetails(operation);
  }

  private displayOperationError(operation: AgentOperation): void {
    if (this.currentSpinner) {
      this.currentSpinner.fail(chalk.red(`❌ ${operation.description}`));
    }
  }

  private displayOperationDetails(operation: AgentOperation): void {
    switch (operation.type) {
      case "file-read":
        this.displayFileReadDetails(operation);
        break;
      case "file-write":
        this.displayFileWriteDetails(operation);
        break;
      case "code-generation":
        this.displayCodeGenerationDetails(operation);
        break;
      case "analysis":
        this.displayAnalysisDetails(operation);
        break;
    }
  }

  private displayFileReadDetails(operation: AgentOperation): void {
    if (operation.details?.lineCount) {
      console.log(
        chalk.dim(
          `    📄 Read ${operation.details.lineCount} lines from ${operation.filePath}`
        )
      );
    }
    if (operation.details?.size) {
      console.log(
        chalk.dim(
          `    📊 File size: ${this.formatBytes(operation.details.size)}`
        )
      );
    }
  }

  private displayFileWriteDetails(operation: AgentOperation): void {
    if (operation.generatedCode) {
      const lines = operation.generatedCode.split("\n").length;
      console.log(chalk.dim(`    ✍️  Generated ${lines} lines of code`));

      // Show a preview of the generated code
      this.displayCodePreview(operation.generatedCode, operation.filePath!);
    }
  }

  private displayCodeGenerationDetails(operation: AgentOperation): void {
    if (operation.generatedCode) {
      console.log(chalk.dim(`    🧠 Generated code block`));
      this.displayCodePreview(operation.generatedCode);
    }
  }

  private displayAnalysisDetails(operation: AgentOperation): void {
    if (operation.details?.findings) {
      console.log(
        chalk.dim(`    🔍 Found ${operation.details.findings} items`)
      );
    }
  }

  private displayCodePreview(code: string, filePath?: string): void {
    const lines = code.split("\n");
    const previewLines = lines.slice(0, 5);

    console.log(
      boxen(
        previewLines
          .map(
            (line, i) =>
              chalk.dim(`${String(i + 1).padStart(2)} `) + chalk.white(line)
          )
          .join("\n") +
          (lines.length > 5
            ? chalk.dim(`\n   ... ${lines.length - 5} more lines`)
            : ""),
        {
          title: filePath
            ? chalk.cyan(`📝 ${filePath}`)
            : chalk.cyan("📝 Generated Code"),
          titleAlignment: "left",
          padding: 1,
          margin: { left: 4 },
          borderStyle: "round",
          borderColor: "blue",
          dimBorder: true,
        }
      )
    );
  }

  showProgressBar(total: number, title: string): void {
    this.progressBar = new cliProgress.SingleBar({
      format:
        chalk.cyan("🚀 " + title) +
        " |" +
        chalk.cyan("{bar}") +
        "| {percentage}% | {value}/{total} | ETA: {eta}s",
      barCompleteChar: "█",
      barIncompleteChar: "░",
      hideCursor: true,
    });
    this.progressBar.start(total, 0);
  }

  updateProgress(value: number): void {
    if (this.progressBar) {
      this.progressBar.update(value);
    }
  }

  hideProgress(): void {
    if (this.progressBar) {
      this.progressBar.stop();
      this.progressBar = undefined;
    }
  }

  displayExecutionSummary(): void {
    const operations = Array.from(this.operations.values());
    const completed = operations.filter((op) => op.status === "completed");
    const errors = operations.filter((op) => op.status === "error");

    console.log("\n" + chalk.yellow("📊 Execution Summary"));
    console.log(chalk.dim("━".repeat(50)));

    const table = new Table({
      head: [
        chalk.cyan("Operation"),
        chalk.cyan("Status"),
        chalk.cyan("Duration"),
        chalk.cyan("File"),
      ],
      colWidths: [25, 12, 12, 30],
      style: {
        head: [],
        border: ["dim"],
      },
    });

    operations.forEach((op) => {
      const duration = op.endTime
        ? `${Math.round(op.endTime - op.startTime)}ms`
        : "-";
      const status =
        op.status === "completed"
          ? chalk.green("✓ Done")
          : op.status === "error"
          ? chalk.red("✗ Error")
          : chalk.yellow("⏳ Running");

      table.push([
        `${this.getOperationIcon(op.type)} ${op.description.substring(0, 20)}`,
        status,
        duration,
        op.filePath ? op.filePath.split("\\").pop() || "" : "-",
      ]);
    });

    console.log(table.toString());

    console.log(chalk.green(`\n✅ ${completed.length} operations completed`));
    if (errors.length > 0) {
      console.log(chalk.red(`❌ ${errors.length} operations failed`));
    }

    const totalTime = operations.reduce((sum, op) => {
      return sum + (op.endTime ? op.endTime - op.startTime : 0);
    }, 0);

    console.log(
      chalk.dim(`⏱️  Total execution time: ${Math.round(totalTime)}ms\n`)
    );
  }

  logFileOperation(
    type: "read" | "write",
    filePath: string,
    details?: any
  ): string {
    const operationType = type === "read" ? "file-read" : "file-write";
    const description = type === "read" ? "Reading file" : "Writing file";

    const id = this.startOperation(operationType, description, filePath);

    // Auto-complete after a short delay to simulate real operation
    setTimeout(() => {
      this.updateOperation(id, {
        status: "completed",
        details,
        generatedCode: details?.code,
      });
    }, 100);

    return id;
  }

  logCodeGeneration(description: string, code: string): string {
    const id = this.startOperation("code-generation", description);

    setTimeout(() => {
      this.updateOperation(id, {
        status: "completed",
        generatedCode: code,
      });
    }, 200);

    return id;
  }

  logAnalysis(description: string, findings?: any): string {
    const id = this.startOperation("analysis", description);

    setTimeout(() => {
      this.updateOperation(id, {
        status: "completed",
        details: { findings },
      });
    }, 150);

    return id;
  }

  private getOperationIcon(type: AgentOperation["type"]): string {
    const icons = {
      "file-read": "📖",
      "file-write": "✍️",
      "code-generation": "🧠",
      analysis: "🔍",
      migration: "🛠️",
      execution: "⚡",
    };
    return icons[type];
  }

  private getOperationColorFunction(
    type: AgentOperation["type"]
  ): (text: string) => string {
    const colorFunctions = {
      "file-read": chalk.blue,
      "file-write": chalk.green,
      "code-generation": chalk.magenta,
      analysis: chalk.yellow,
      migration: chalk.gray,
      execution: chalk.cyan,
    };
    return colorFunctions[type];
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }
}

// Create singleton instance
export const agentLogger = new AgentLogger();

export function displayPlan(plan: ExecutionPlan): void {
  console.log("\n" + chalk.yellow("📋 Execution Plan:"));
  console.log(chalk.dim(plan.description));

  plan.steps.forEach((step, index) => {
    console.log(`${chalk.dim(`${index + 1}.`)} ${step.description}`);
    if (step.files?.length) {
      step.files.forEach((file) => {
        console.log(`   ${chalk.dim("→")} ${chalk.cyan(file)}`);
      });
    }
  });
}

export async function confirmExecution(): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(
      chalk.yellow("\nExecute this plan? (y/N): "),
      (answer: string) => {
        resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
      }
    );
  });
}

export function closeLogger(): void {
  agentLogger.displayExecutionSummary();
  rl.close();
}
