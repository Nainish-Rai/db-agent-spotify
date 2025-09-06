import chalk from "chalk";
import { analyzeProject } from "../utils/projectAnalyzer";
import type { AnalyzeCommandOptions } from "../types";

export async function analyzeCommand(options: AnalyzeCommandOptions) {
  try {
    console.log(chalk.blue("🔍 Analyzing project structure..."));

    const analysis = await analyzeProject();

    console.log("\n" + chalk.yellow("📊 Project Analysis:"));
    console.log(`Framework: ${chalk.cyan(analysis.framework)}`);
    console.log(
      `TypeScript: ${chalk.cyan(analysis.hasTypeScript ? "Yes" : "No")}`
    );
    console.log(
      `Database: ${chalk.cyan(analysis.database?.provider || "None detected")}`
    );

    console.log("\n" + chalk.yellow("📁 Key Directories:"));
    Object.entries(analysis.structure).forEach(([dir, files]) => {
      if (files.length > 0) {
        console.log(
          `${chalk.dim("→")} ${chalk.cyan(dir)}: ${files.length} files`
        );
        if (options.verbose) {
          files.slice(0, 5).forEach((file) => {
            console.log(`   ${chalk.dim("•")} ${file}`);
          });
          if (files.length > 5) {
            console.log(
              `   ${chalk.dim("•")} ... and ${files.length - 5} more`
            );
          }
        }
      }
    });

    if (analysis.existingSchemas.length > 0) {
      console.log("\n" + chalk.yellow("🗄️ Existing Database Schemas:"));
      analysis.existingSchemas.forEach((schema) => {
        console.log(`${chalk.dim("→")} ${chalk.cyan(schema.name)}`);
        if (options.verbose && schema.tables.length > 0) {
          schema.tables.forEach((table) => {
            console.log(`   ${chalk.dim("•")} ${table}`);
          });
        }
      });
    }

    if (analysis.apiRoutes.length > 0) {
      console.log("\n" + chalk.yellow("🛠️ API Routes:"));
      analysis.apiRoutes.forEach((route) => {
        console.log(`${chalk.dim("→")} ${chalk.cyan(route)}`);
      });
    }

    console.log("\n" + chalk.green("✅ Analysis complete!"));
  } catch (error) {
    console.error(
      chalk.red("Analysis failed:"),
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}
