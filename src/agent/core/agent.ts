import {
  FileWriter,
  SchemaDefinition,
  ApiRouteDefinition,
} from "./file-writer";
import { generateExecutionPlan } from "../../cli/ai/geminiClient";
import { agentLogger } from "../../cli/utils/logger";
import { analyzeProject } from "../../cli/utils/projectAnalyzer";
import { migrateCommand } from "../../cli/commands/migrate";
import type { ProjectContext } from "../../cli/types";

export interface AgentRequest {
  query: string;
  projectPath?: string;
  skipAnalysis?: boolean;
  skipMigration?: boolean;
}

export interface ExecutionStep {
  type:
    | "create_schema"
    | "create_api"
    | "update_component"
    | "run_migration"
    | "create_component"
    | "analyze_project";
  details?: any;
  description: string;
}

export interface AgentResult {
  success: boolean;
  steps: ExecutionStep[];
  files: string[];
  errors?: string[];
  projectContext?: ProjectContext;
  migrationCompleted?: boolean;
}

export class DatabaseAgent {
  private fileWriter: FileWriter;
  private projectContext?: ProjectContext;

  constructor(projectPath: string = process.cwd()) {
    this.fileWriter = new FileWriter(projectPath);
  }

  async execute(request: AgentRequest): Promise<AgentResult> {
    const analysisId = agentLogger.startOperation(
      "analysis",
      `Processing agent request: ${request.query}`
    );

    const result: AgentResult = {
      success: false,
      steps: [],
      files: [],
      errors: [],
    };

    try {
      // Step 1: Analyze project first (unless skipped)
      if (!request.skipAnalysis) {
        const projectAnalysisId = agentLogger.startOperation(
          "analysis",
          "Analyzing project structure and dependencies"
        );

        try {
          this.projectContext = await analyzeProject();
          result.projectContext = this.projectContext;

          agentLogger.updateOperation(projectAnalysisId, {
            status: "completed",
            details: {
              findings: `Framework: ${this.projectContext.framework}, TypeScript: ${this.projectContext.hasTypeScript}, Schemas: ${this.projectContext.existingSchemas.length}, Components: ${this.projectContext.components.length}`,
            },
          });
        } catch (error) {
          agentLogger.updateOperation(projectAnalysisId, { status: "error" });
          throw new Error(
            `Project analysis failed: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }

      agentLogger.updateOperation(analysisId, { status: "completed" });

      // Step 2: Generate execution plan with project context
      const planGenerationId = agentLogger.startOperation(
        "analysis",
        "Generating execution plan with AI"
      );

      const executionPlan = await generateExecutionPlan(
        request.query,
        this.projectContext
      );
      result.steps = executionPlan.steps;

      agentLogger.updateOperation(planGenerationId, {
        status: "completed",
        details: { findings: `${executionPlan.steps.length} steps planned` },
      });

      // Step 3: Execute all steps
      agentLogger.showProgressBar(
        executionPlan.steps.length,
        "Executing Agent Steps"
      );

      let needsMigration = false;

      for (let i = 0; i < executionPlan.steps.length; i++) {
        const step = executionPlan.steps[i];
        try {
          const executionId = agentLogger.startOperation(
            "execution",
            `Step ${i + 1}/${executionPlan.steps.length}: ${step.description}`
          );

          const files = await this.executeStep(step);
          result.files.push(...files);

          // Check if this step requires migration
          if (step.type === "create_schema" || step.type === "run_migration") {
            needsMigration = true;
          }

          agentLogger.updateOperation(executionId, { status: "completed" });
          agentLogger.updateProgress(i + 1);
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          result.errors?.push(`Step ${step.type} failed: ${errorMsg}`);

          const executionId = agentLogger.startOperation(
            "execution",
            `Error in step ${step.type}: ${errorMsg}`
          );
          agentLogger.updateOperation(executionId, { status: "error" });
        }
      }

      agentLogger.hideProgress();

      // Step 4: Run migration if needed and not skipped
      if (needsMigration && !request.skipMigration) {
        const migrationId = agentLogger.startOperation(
          "migration",
          "Running database migrations"
        );

        try {
          await migrateCommand({ generate: true, push: true });
          result.migrationCompleted = true;

          agentLogger.updateOperation(migrationId, {
            status: "completed",
            details: { findings: "Database schema updated successfully" },
          });
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          result.errors?.push(`Migration failed: ${errorMsg}`);

          agentLogger.updateOperation(migrationId, { status: "error" });
        }
      }

      result.success = (result.errors?.length || 0) === 0;

      if (result.success) {
        const summaryId = agentLogger.startOperation(
          "analysis",
          `Agent execution completed successfully. Generated ${
            result.files.length
          } files${result.migrationCompleted ? " and updated database" : ""}`
        );
        agentLogger.updateOperation(summaryId, { status: "completed" });
      } else {
        const summaryId = agentLogger.startOperation(
          "analysis",
          `Agent execution completed with ${result.errors?.length} errors`
        );
        agentLogger.updateOperation(summaryId, { status: "error" });
      }

      return result;
    } catch (error) {
      agentLogger.hideProgress();
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.errors = [errorMsg];

      agentLogger.updateOperation(analysisId, { status: "error" });

      const errorId = agentLogger.startOperation(
        "analysis",
        `Fatal error during agent execution: ${errorMsg}`
      );
      agentLogger.updateOperation(errorId, { status: "error" });

      return result;
    }
  }

  private async executeStep(step: ExecutionStep): Promise<string[]> {
    const files: string[] = [];

    switch (step.type) {
      case "create_schema":
        agentLogger.logAnalysis(`Creating database schema`);
        const schema = this.parseSchemaFromStep(step);
        await this.fileWriter.createSchema(schema);
        files.push(`src/database/schemas/${schema.tableName}.ts`);
        break;

      case "create_api":
        agentLogger.logAnalysis(`Creating API route`);
        const api = this.parseApiFromStep(step);
        await this.fileWriter.createApiRoute(api);
        files.push(`src/app/api/${api.endpoint}/route.ts`);
        break;

      case "update_component":
        agentLogger.logAnalysis(`Updating existing components`);
        const { componentPaths, endpoint, tableName } = step.details;
        for (const componentPath of componentPaths) {
          await this.fileWriter.updateComponent(
            componentPath,
            endpoint,
            tableName
          );
          files.push(componentPath);
        }
        break;

      case "create_component":
        agentLogger.logAnalysis(`Creating new components`);
        const {
          componentPaths: newComponentPaths,
          endpoint: newEndpoint,
          tableName: newTableName,
        } = step.details;
        for (const componentPath of newComponentPaths) {
          await this.fileWriter.createComponent(
            componentPath,
            newEndpoint,
            newTableName
          );
          files.push(componentPath);
        }
        break;

      case "run_migration":
        agentLogger.logAnalysis(`Running database migration`);
        await this.fileWriter.runMigration();
        break;

      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }

    return files;
  }

  private parseSchemaFromStep(step: ExecutionStep): SchemaDefinition {
    const { tableName, columns, relationships } = step.details;

    return {
      tableName,
      columns: columns.map((col: any) => ({
        name: col.name,
        type: this.mapColumnType(col.type, col.length),
        constraints: col.constraints || [],
      })),
      relationships: relationships || [],
    };
  }

  private parseApiFromStep(step: ExecutionStep): ApiRouteDefinition {
    const {
      endpoint,
      tableName,
      methods = ["GET", "POST"],
      operations = [],
    } = step.details;

    return {
      endpoint,
      methods,
      tableName,
      operations,
    };
  }

  private mapColumnType(type: string, length?: number): string {
    const typeMap: Record<string, string> = {
      string: `varchar("${type.toLowerCase()}", { length: ${length || 255} })`,
      text: 'text("text")',
      number: 'integer("number")',
      integer: 'integer("integer")',
      boolean: 'boolean("boolean").default(false)',
      date: 'timestamp("date")',
      datetime: 'timestamp("datetime")',
    };

    return (
      typeMap[type.toLowerCase()] ||
      `varchar("${type.toLowerCase()}", { length: 255 })`
    );
  }

  async generateRecentlyPlayedExample(): Promise<AgentResult> {
    agentLogger.logAnalysis("Running recently played example generation");

    const request: AgentRequest = {
      query:
        "Create a recently_played table with song_id, user_id, played_at timestamp, and create API endpoints and update RecentlyPlayed component",
    };

    return this.execute(request);
  }
}
