import { promises as fs } from "fs";
import path from "path";
import type { ExecutionPlan, ExecutionStep } from "../types.js";

export async function executePlan(
  plan: ExecutionPlan,
  spinner: any
): Promise<void> {
  for (const [index, step] of plan.steps.entries()) {
    spinner.start(`${step.description}...`);
    await executeStep(step);
    spinner.succeed(`Step ${index + 1} complete`);
  }
}

async function executeStep(step: ExecutionStep): Promise<void> {
  switch (step.type) {
    case "create_schema":
      await createSchema(step);
      break;
    case "create_api":
      await createApi(step);
      break;
    case "update_component":
      await updateComponent(step);
      break;
    default:
      throw new Error(`Unknown step type: ${step.type}`);
  }
}

async function createSchema(step: ExecutionStep): Promise<void> {
  const { tableName, fields } = step.details;

  const schemaCode = generateSchemaCode(tableName, fields);
  const filePath = `src/database/schemas/${tableName}.ts`;

  await ensureDirectory(path.dirname(filePath));
  await fs.writeFile(filePath, schemaCode, "utf-8");
}

async function createApi(step: ExecutionStep): Promise<void> {
  const { endpoint, tableName, methods = ["GET", "POST"] } = step.details;

  const apiCode = generateApiCode(endpoint, tableName, methods);
  const filePath = `src/app/api/${endpoint}/route.ts`;

  await ensureDirectory(path.dirname(filePath));
  await fs.writeFile(filePath, apiCode, "utf-8");
}

async function updateComponent(step: ExecutionStep): Promise<void> {
  const { componentPaths, endpoint, tableName } = step.details;

  for (const componentPath of componentPaths) {
    try {
      const existingCode = await fs.readFile(componentPath, "utf-8");
      const updatedCode = generateComponentUpdate(
        existingCode,
        endpoint,
        tableName
      );
      await fs.writeFile(componentPath, updatedCode, "utf-8");
    } catch (error) {
      console.warn(`Warning: Could not update component ${componentPath}`);
    }
  }
}

function generateSchemaCode(tableName: string, fields: any[]): string {
  const imports = [
    "import { pgTable, serial, varchar, text, timestamp, boolean, integer } from 'drizzle-orm/pg-core';",
    "import { InferSelectModel, InferInsertModel } from 'drizzle-orm';",
  ];

  const tableFields = [];

  if (!fields.some((f) => f.name === "id")) {
    tableFields.push(`  id: serial('id').primaryKey(),`);
  }

  fields.forEach((field) => {
    const fieldType = mapFieldType(field.type);
    const constraints = [];

    if (field.primary) constraints.push(".primaryKey()");
    if (field.required && !field.primary) constraints.push(".notNull()");
    if (field.unique) constraints.push(".unique()");

    tableFields.push(
      `  ${field.name}: ${fieldType}('${field.name}')${constraints.join("")},`
    );
  });

  if (!fields.some((f) => f.name === "createdAt")) {
    tableFields.push(
      `  createdAt: timestamp('created_at').defaultNow().notNull(),`
    );
  }
  if (!fields.some((f) => f.name === "updatedAt")) {
    tableFields.push(
      `  updatedAt: timestamp('updated_at').defaultNow().notNull(),`
    );
  }

  return `${imports.join("\n")}

export const ${tableName} = pgTable('${toSnakeCase(tableName)}', {
${tableFields.join("\n")}
});

export type ${toPascalCase(tableName)} = InferSelectModel<typeof ${tableName}>;
export type New${toPascalCase(
    tableName
  )} = InferInsertModel<typeof ${tableName}>;`;
}

function generateApiCode(
  endpoint: string,
  tableName: string,
  methods: string[]
): string {
  const imports = [
    "import { NextRequest, NextResponse } from 'next/server';",
    "import { z } from 'zod';",
    "import { db } from '@/lib/db';",
    `import { ${tableName} } from '@/database/schemas/${tableName}';`,
    "import { eq } from 'drizzle-orm';",
  ];

  const validationSchema = `const ${tableName}Schema = z.object({
  name: z.string().min(1),
});`;

  const methodImplementations = [];

  if (methods.includes("GET")) {
    methodImplementations.push(`export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
      const record = await db.select().from(${tableName}).where(eq(${tableName}.id, parseInt(id)));

      if (record.length === 0) {
        return NextResponse.json({ error: 'Record not found' }, { status: 404 });
      }

      return NextResponse.json(record[0]);
    }

    const records = await db.select().from(${tableName}).limit(100);
    return NextResponse.json(records);
  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}`);
  }

  if (methods.includes("POST")) {
    methodImplementations.push(`export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = ${tableName}Schema.parse(body);

    const result = await db.insert(${tableName}).values(validatedData).returning();

    return NextResponse.json(result[0], { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }

    console.error('POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}`);
  }

  return `${imports.join("\n")}

${validationSchema}

${methodImplementations.join("\n\n")}`;
}

function generateComponentUpdate(
  existingCode: string,
  endpoint: string,
  tableName: string
): string {
  const hookImport = `import { use${toPascalCase(
    tableName
  )} } from '@/hooks/use${toPascalCase(tableName)}';`;

  if (existingCode.includes("useState")) {
    const lines = existingCode.split("\n");
    const importIndex = lines.findIndex(
      (line) => line.includes("import") && line.includes("react")
    );

    if (importIndex !== -1) {
      lines.splice(importIndex + 1, 0, hookImport);
    }

    return lines.join("\n");
  }

  return existingCode;
}

async function ensureDirectory(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

function mapFieldType(type: string): string {
  const typeMap: Record<string, string> = {
    string: "varchar",
    text: "text",
    number: "integer",
    boolean: "boolean",
    date: "timestamp",
    serial: "serial",
  };

  return typeMap[type.toLowerCase()] || "varchar";
}

function toSnakeCase(str: string): string {
  return str
    .replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
    .replace(/^_/, "");
}

function toPascalCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
