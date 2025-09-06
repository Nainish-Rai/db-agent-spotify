import chalk from "chalk";
import { createInterface } from "readline";
import type { ExecutionPlan } from "../types.js";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

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
  rl.close();
}
