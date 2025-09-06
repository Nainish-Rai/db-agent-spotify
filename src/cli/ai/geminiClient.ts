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
  }

  return files;
}
