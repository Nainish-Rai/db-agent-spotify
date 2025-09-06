import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "../../..");
dotenv.config({ path: join(rootDir, ".env") });

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ProjectContext, ExecutionPlan } from "../types";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY is not set in environment variables");
}

const client = new GoogleGenerativeAI(apiKey);
const model = client.getGenerativeModel({ model: "gemini-2.5-flash" });

export async function processWithAI(
  query: string,
  context: ProjectContext
): Promise<ExecutionPlan> {
  console.log("Processing AI request with query:", query);

  const prompt = generatePrompt(query, context);

  try {
    console.log("Calling Gemini API...");
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    console.log("Received response from Gemini API");

    return parseResponse(text);
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error(
      `AI processing failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export async function generateExecutionPlan(
  query: string,
  context?: ProjectContext
): Promise<ExecutionPlan> {
  const prompt = context
    ? generatePrompt(query, context)
    : generateBasicPrompt(query);

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return parseResponse(text);
  } catch (error) {
    throw new Error(
      `AI processing failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function generateBasicPrompt(query: string): string {
  return `You are an AI agent that generates execution plans for database operations in a Next.js project with Drizzle ORM and PostgreSQL.

User Query: "${query}"

Generate a detailed execution plan as JSON with this exact structure:
{
  "description": "Brief description of what will be done",
  "steps": [
    {
      "type": "create_schema",
      "description": "Create database schema",
      "details": {
        "tableName": "recently_played",
        "columns": [
          {"name": "songId", "type": "integer", "constraints": [".references(() => songs.id)"]},
          {"name": "userId", "type": "integer", "constraints": [".references(() => users.id)"]},
          {"name": "playedAt", "type": "timestamp", "constraints": [".defaultNow().notNull()"]}
        ],
        "relationships": [
          {"type": "manyToOne", "table": "songs", "column": "songId"},
          {"type": "manyToOne", "table": "users", "column": "userId"}
        ]
      }
    },
    {
      "type": "run_migration",
      "description": "Run database migration",
      "details": {}
    },
    {
      "type": "create_api",
      "description": "Create API endpoints",
      "details": {
        "endpoint": "recently-played",
        "tableName": "recently_played",
        "methods": ["GET", "POST"],
        "operations": ["list", "create"]
      }
    },
    {
      "type": "create_component",
      "description": "Create new UI components",
      "details": {
        "componentPaths": ["src/components/playlist-manager.tsx"],
        "endpoint": "recently-played",
        "tableName": "recently_played"
      }
    }
  ]
}

Rules:
1. Use proper Drizzle column types: varchar(), text(), integer(), timestamp(), boolean()
2. Include proper constraints like .notNull(), .references(), .defaultNow()
3. Always include run_migration step after schema creation
4. Use kebab-case for API endpoints
5. Use snake_case for table names
6. For components, use "create_component" type and suggest NEW component file names that don't exist yet
7. Component paths should be logical and follow naming conventions like "playlist-manager.tsx", "user-dashboard.tsx", etc.
8. Never suggest updating existing components that may not exist

Respond with ONLY the JSON, no explanations.`;
}

function generatePrompt(query: string, context: ProjectContext): string {
  return `Project Context:
- Existing schemas: ${
    context.existingSchemas.map((s) => s.name).join(", ") || "None"
  }
- API routes: ${context.apiRoutes.length} routes
- Components: ${context.components.length} components

User Query: "${query}"

Generate an execution plan as JSON with this structure:
{
  "description": "Brief description of what will be done",
  "steps": [
    {
      "type": "create_schema|create_api|update_component",
      "description": "What this step does",
      "details": {
        "tableName": "name",
        "endpoint": "api/endpoint",
        "componentPaths": ["path1", "path2"],
        "fields": [
          {"name": "id", "type": "serial", "primary": true},
          {"name": "name", "type": "varchar", "required": true}
        ]
      }
    }
  ]
}

Rules:
1. Use Drizzle ORM syntax for schemas
2. Follow Next.js 15+ app router conventions
3. Generate RESTful API endpoints
4. Update relevant UI components
5. Create proper TypeScript types
6. Follow the project's existing patterns

Respond with ONLY the JSON, no explanations.`;
}

function parseResponse(response: string): ExecutionPlan {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.description || !Array.isArray(parsed.steps)) {
      throw new Error("Invalid plan structure");
    }

    return {
      description: parsed.description,
      steps: parsed.steps.map((step: any) => ({
        type: step.type,
        description: step.description,
        details: step.details || {},
        files: enhanceWithFilePaths(step),
      })),
    };
  } catch (error) {
    throw new Error(
      `Failed to parse AI response: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function enhanceWithFilePaths(step: any): string[] {
  const files: string[] = [];

  switch (step.type) {
    case "create_schema":
      if (step.details.tableName) {
        files.push(`src/database/schemas/${step.details.tableName}.ts`);
      }
      break;
    case "create_api":
      if (step.details.endpoint) {
        files.push(`src/app/api/${step.details.endpoint}/route.ts`);
      }
      break;
    case "update_component":
      if (step.details.componentPaths) {
        files.push(...step.details.componentPaths);
      }
      break;
    case "create_component":
      if (step.details.componentPaths) {
        files.push(...step.details.componentPaths);
      }
      break;
  }

  return files;
}
