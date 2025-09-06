import { Command } from "commander";
import chalk from "chalk";
import { runCommand } from "./commands/run";
import { analyzeCommand } from "./commands/analyze";

const program = new Command();

program
  .name("db-agent")
  .description("AI-powered database agent for Next.js projects")
  .version("1.0.0");

program
  .command("run")
  .description("Execute an AI query to modify your project")
  .argument("<query>", "What you want the agent to do")
  .option("-d, --dry-run", "Show planned changes without executing them")
  .option("-v, --verbose", "Show detailed logs")
  .action(runCommand);

program
  .command("analyze")
  .description("Analyze current project structure")
  .option("-v, --verbose", "Show detailed analysis")
  .action(analyzeCommand);

// Parse arguments and execute
program.parse();

process.on("uncaughtException", (error) => {
  console.error(chalk.red("Error:"), error.message);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error(chalk.red("Error:"), reason);
  process.exit(1);
});
