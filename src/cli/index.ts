import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

// Get the directory of this file and find the root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "../..");
const envPath = join(rootDir, ".env");

const result = dotenv.config({ path: envPath });
console.log(
  "Dotenv result:",
  result.error ? `Error: ${result.error}` : "Success"
);

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
  .argument(
    "<query...>",
    "What you want the agent to do (can be multiple words)"
  )
  .option("-d, --dry-run", "Show planned changes without executing them")
  .option("-v, --verbose", "Show detailed logs")
  .action((queryArgs, options) => {
    const query = Array.isArray(queryArgs) ? queryArgs.join(" ") : queryArgs;
    return runCommand(query, options);
  });

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
