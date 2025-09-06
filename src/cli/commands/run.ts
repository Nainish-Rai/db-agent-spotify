import chalk from "chalk";
import ora from "ora";
import { analyzeProject } from "../utils/projectAnalyzer";
import { processWithAI } from "../ai/geminiClient";
import { displayPlan, confirmExecution } from "../utils/logger";
import { executePlan } from "../utils/executor";
import type { RunCommandOptions } from "../types.js";

export async function runCommand(query: string, options: RunCommandOptions) {
  const spinner = ora();

  try {
    console.log(chalk.blue("🤖 DB Agent starting..."));

    spinner.start("🔍 Analyzing project structure...");
    const projectContext = await analyzeProject();
    spinner.succeed("Project analysis complete");

    spinner.start("🧠 Thinking...");
    const plan = await processWithAI(query, projectContext);
    spinner.succeed("Query processed");

    displayPlan(plan);

    if (options.dryRun) {
      console.log("\n" + chalk.yellow("🏃 Dry run complete - no changes made"));
      return;
    }

    const shouldExecute = await confirmExecution();
    if (!shouldExecute) {
      console.log(chalk.yellow("Operation cancelled"));
      return;
    }

    console.log("\n" + chalk.green("🚀 Executing plan..."));
    await executePlan(plan, spinner);

    console.log("\n" + chalk.green("✅ All changes completed successfully!"));
  } catch (error) {
    spinner.fail("Operation failed");
    console.error(
      chalk.red("Error:"),
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}
