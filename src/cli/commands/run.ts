import chalk from "chalk";
import { DatabaseAgent } from "../../agent/core/agent";
import {
  agentLogger,
  confirmExecution,
  closeLogger,
  displayPlan,
} from "../utils/logger";
import type { RunCommandOptions } from "../types.js";

export async function runCommand(query: string, options: RunCommandOptions) {
  try {
    console.log(chalk.blue("🤖 DB Agent starting..."));
    console.log(chalk.dim(`Query: "${query}"`));

    const agent = new DatabaseAgent();

    // Create agent request with options
    const agentRequest = {
      query,
      skipAnalysis: false, // Always analyze for better context
      skipMigration: options.dryRun, // Skip migration in dry run mode
    };

    const initId = agentLogger.startOperation(
      "analysis",
      "Initializing database agent"
    );
    agentLogger.updateOperation(initId, { status: "completed" });

    // Execute the agent with enhanced capabilities
    const result = await agent.execute(agentRequest);

    // Display execution results
    if (result.projectContext) {
      console.log(chalk.cyan("\n📊 Project Analysis:"));
      console.log(chalk.dim(`  Framework: ${result.projectContext.framework}`));
      console.log(
        chalk.dim(
          `  TypeScript: ${result.projectContext.hasTypeScript ? "Yes" : "No"}`
        )
      );
      console.log(
        chalk.dim(
          `  Existing Schemas: ${result.projectContext.existingSchemas.length}`
        )
      );
      console.log(
        chalk.dim(`  Components: ${result.projectContext.components.length}`)
      );
      console.log(
        chalk.dim(`  API Routes: ${result.projectContext.apiRoutes.length}`)
      );
    }

    if (options.dryRun) {
      console.log("\n" + chalk.yellow("🏃 Dry run complete - no changes made"));
      console.log(chalk.gray("Files that would be modified:"));
      result.files.forEach((file) => console.log(chalk.gray(`  - ${file}`)));

      if (
        result.steps.some(
          (step) =>
            step.type === "create_schema" || step.type === "run_migration"
        )
      ) {
        console.log(chalk.yellow("🛠️  Database migration would be executed"));
      }

      closeLogger();
      return;
    }

    // Show execution plan if not in dry run
    if (result.steps.length > 0) {
      displayPlan({
        description: `Execute ${result.steps.length} steps for: ${query}`,
        steps: result.steps,
      });
    }

    const shouldExecute = await confirmExecution();
    if (!shouldExecute) {
      console.log(chalk.yellow("Operation cancelled"));
      closeLogger();
      return;
    }

    if (result.success) {
      console.log(
        "\n" + chalk.green("✅ All operations completed successfully!")
      );

      if (result.files.length > 0) {
        console.log(chalk.cyan("📁 Files modified:"));
        result.files.forEach((file) => console.log(chalk.green(`  ✓ ${file}`)));
      }

      if (result.migrationCompleted) {
        console.log(
          chalk.green("🛠️  Database migration completed successfully")
        );
      }

      console.log(
        chalk.dim(`\n⏱️  Total steps executed: ${result.steps.length}`)
      );
    } else {
      console.log("\n" + chalk.red("❌ Some operations failed:"));
      result.errors?.forEach((error) => console.log(chalk.red(`  ✗ ${error}`)));

      if (result.files.length > 0) {
        console.log(
          chalk.yellow("\n📁 Files that were successfully modified:")
        );
        result.files.forEach((file) =>
          console.log(chalk.yellow(`  ~ ${file}`))
        );
      }
    }

    closeLogger();
  } catch (error) {
    const errorId = agentLogger.startOperation(
      "analysis",
      `Fatal error: ${error instanceof Error ? error.message : String(error)}`
    );
    agentLogger.updateOperation(errorId, { status: "error" });

    console.error(
      chalk.red("Error:"),
      error instanceof Error ? error.message : String(error)
    );
    closeLogger();
    process.exit(1);
  }
}
