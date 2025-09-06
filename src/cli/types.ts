export interface RunCommandOptions {
  dryRun?: boolean;
  verbose?: boolean;
}

export interface AnalyzeCommandOptions {
  verbose?: boolean;
}

export interface ProjectContext {
  framework: string;
  hasTypeScript: boolean;
  structure: Record<string, string[]>;
  database: {
    provider: string;
    schemas: string[];
  } | null;
  existingSchemas: DatabaseSchema[];
  apiRoutes: string[];
  components: string[];
  dependencies: Record<string, string>;
}

export interface DatabaseSchema {
  name: string;
  tables: string[];
  path: string;
}

export interface ExecutionPlan {
  description: string;
  steps: ExecutionStep[];
}

export interface ExecutionStep {
  type: "create_schema" | "create_api" | "update_component";
  description: string;
  details: any;
  files?: string[];
}
