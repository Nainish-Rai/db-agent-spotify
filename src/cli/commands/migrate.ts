import chalk from "chalk";
import ora from "ora";
import { spawn, exec as execCallback } from "child_process";
import { promisify } from "util";

const exec = promisify(execCallback);

export async function migrateCommand(options: {
  generate?: boolean;
  push?: boolean;
}) {
  const spinner = ora();

  try {
    if (options.generate) {
      spinner.start("🔄 Generating database migrations...");
      await exec("npx drizzle-kit generate");
      spinner.succeed("Migrations generated successfully");
    }

    if (options.push) {
      spinner.start("🚀 Pushing migrations to database...");
      await exec("npx drizzle-kit push");
      spinner.succeed("Migrations pushed successfully");
    }

    if (!options.generate && !options.push) {
      // Default: generate and push
      spinner.start("🔄 Generating database migrations...");
      await exec("npx drizzle-kit generate");
      spinner.succeed("Migrations generated");

      spinner.start("🚀 Pushing migrations to database...");
      await exec("npx drizzle-kit push");
      spinner.succeed("Database updated successfully");
    }

    console.log(chalk.green("✅ Database migration completed!"));
  } catch (error) {
    spinner.fail("Migration failed");
    console.error(
      chalk.red("Error:"),
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}
