import { promises as fs } from "fs";
import path from "path";
import { exec as execCallback } from "child_process";
import { promisify } from "util";
import { agentLogger } from "../../cli/utils/logger";

const exec = promisify(execCallback);

export interface FileOperation {
  type: "create" | "update" | "delete";
  filePath: string;
  content?: string;
  backup?: boolean;
}

export interface SchemaDefinition {
  tableName: string;
  columns: Array<{
    name: string;
    type: string;
    constraints?: string[];
  }>;
  relationships?: Array<{
    type: "oneToMany" | "manyToOne" | "manyToMany";
    table: string;
    column: string;
  }>;
}

export interface ApiRouteDefinition {
  endpoint: string;
  methods: string[];
  tableName: string;
  operations: string[];
}

export class FileWriter {
  private projectRoot: string;
  private backupDir: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
    this.backupDir = path.join(projectRoot, ".agent-backups");
  }

  async ensureDirectory(dirPath: string): Promise<void> {
    const fullPath = path.resolve(this.projectRoot, dirPath);
    agentLogger.logFileOperation("write", fullPath, {
      type: "directory-creation",
    });
    await fs.mkdir(fullPath, { recursive: true });
  }

  async backupFile(filePath: string): Promise<string> {
    const fullPath = path.resolve(this.projectRoot, filePath);
    const backupPath = path.join(
      this.backupDir,
      `${Date.now()}-${path.basename(filePath)}`
    );

    try {
      await fs.access(fullPath);
      const stats = await fs.stat(fullPath);
      agentLogger.logFileOperation("read", fullPath, {
        type: "backup",
        size: stats.size,
      });

      await this.ensureDirectory(path.dirname(backupPath));
      await fs.copyFile(fullPath, backupPath);
      return backupPath;
    } catch {
      return "";
    }
  }

  async writeFile(operation: FileOperation): Promise<void> {
    const fullPath = path.resolve(this.projectRoot, operation.filePath);

    if (operation.backup) {
      await this.backupFile(operation.filePath);
    }

    await this.ensureDirectory(path.dirname(operation.filePath));

    switch (operation.type) {
      case "create":
      case "update":
        if (!operation.content)
          throw new Error("Content required for create/update");

        agentLogger.logFileOperation("write", operation.filePath, {
          type: operation.type,
          code: operation.content,
          lineCount: operation.content.split("\n").length,
          size: Buffer.byteLength(operation.content, "utf8"),
        });

        await fs.writeFile(fullPath, operation.content, "utf-8");
        break;
      case "delete":
        agentLogger.logFileOperation("write", operation.filePath, {
          type: "delete",
        });
        await fs.unlink(fullPath);
        break;
    }
  }

  generateSchemaFile(schema: SchemaDefinition): string {
    // Log code generation
    agentLogger.logCodeGeneration(
      `Generating schema for ${schema.tableName}`,
      ""
    );

    const imports = [
      "pgTable",
      "serial",
      "varchar",
      "text",
      "integer",
      "timestamp",
      "boolean",
    ];

    let content = `import { ${imports.join(
      ", "
    )} } from "drizzle-orm/pg-core";\n\n`;

    content += `export const ${schema.tableName} = pgTable("${schema.tableName}", {\n`;
    content += '  id: serial("id").primaryKey(),\n';

    schema.columns.forEach((col) => {
      const constraints = col.constraints?.join("") || "";
      content += `  ${col.name}: ${col.type}${constraints},\n`;
    });

    content += '  createdAt: timestamp("created_at").defaultNow().notNull(),\n';
    content += '  updatedAt: timestamp("updated_at").defaultNow().notNull(),\n';
    content += "});\n";

    if (schema.relationships) {
      content += "\n// Relationships\n";
      schema.relationships.forEach((rel) => {
        content += `// ${rel.type}: ${rel.table}.${rel.column}\n`;
      });
    }

    // Log the generated code
    agentLogger.logCodeGeneration(
      `Schema definition for ${schema.tableName}`,
      content
    );

    return content;
  }

  generateApiRoute(api: ApiRouteDefinition): string {
    agentLogger.logCodeGeneration(
      `Generating API route for ${api.endpoint}`,
      ""
    );

    const hasGet = api.methods.includes("GET");
    const hasPost = api.methods.includes("POST");
    const hasPut = api.methods.includes("PUT");
    const hasDelete = api.methods.includes("DELETE");

    let content = `import { NextRequest, NextResponse } from "next/server";\n`;
    content += `import { db } from "@/database";\n`;
    content += `import { ${api.tableName} } from "@/database/schema";\n`;

    if (hasGet || hasPut || hasDelete) {
      content += `import { eq } from "drizzle-orm";\n`;
    }

    content += "\n";

    if (hasGet) {
      content += `export async function GET(request: NextRequest) {\n`;
      content += `  try {\n`;
      content += `    const { searchParams } = new URL(request.url);\n`;
      content += `    const id = searchParams.get("id");\n\n`;
      content += `    if (id) {\n`;
      content += `      const item = await db.select().from(${api.tableName}).where(eq(${api.tableName}.id, parseInt(id)));\n`;
      content += `      return NextResponse.json(item[0] || null);\n`;
      content += `    }\n\n`;
      content += `    const items = await db.select().from(${api.tableName});\n`;
      content += `    return NextResponse.json(items);\n`;
      content += `  } catch (error) {\n`;
      content += `    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });\n`;
      content += `  }\n`;
      content += `}\n\n`;
    }

    if (hasPost) {
      content += `export async function POST(request: NextRequest) {\n`;
      content += `  try {\n`;
      content += `    const body = await request.json();\n`;
      content += `    const result = await db.insert(${api.tableName}).values(body).returning();\n`;
      content += `    return NextResponse.json(result[0]);\n`;
      content += `  } catch (error) {\n`;
      content += `    return NextResponse.json({ error: "Failed to create item" }, { status: 500 });\n`;
      content += `  }\n`;
      content += `}\n\n`;
    }

    if (hasPut) {
      content += `export async function PUT(request: NextRequest) {\n`;
      content += `  try {\n`;
      content += `    const body = await request.json();\n`;
      content += `    const { id, ...updateData } = body;\n`;
      content += `    const result = await db.update(${api.tableName})\n`;
      content += `      .set({ ...updateData, updatedAt: new Date() })\n`;
      content += `      .where(eq(${api.tableName}.id, id))\n`;
      content += `      .returning();\n`;
      content += `    return NextResponse.json(result[0]);\n`;
      content += `  } catch (error) {\n`;
      content += `    return NextResponse.json({ error: "Failed to update item" }, { status: 500 });\n`;
      content += `  }\n`;
      content += `}\n\n`;
    }

    if (hasDelete) {
      content += `export async function DELETE(request: NextRequest) {\n`;
      content += `  try {\n`;
      content += `    const { searchParams } = new URL(request.url);\n`;
      content += `    const id = searchParams.get("id");\n`;
      content += `    if (!id) throw new Error("ID required");\n\n`;
      content += `    await db.delete(${api.tableName}).where(eq(${api.tableName}.id, parseInt(id)));\n`;
      content += `    return NextResponse.json({ success: true });\n`;
      content += `  } catch (error) {\n`;
      content += `    return NextResponse.json({ error: "Failed to delete item" }, { status: 500 });\n`;
      content += `  }\n`;
      content += `}\n`;
    }

    // Log the generated API route
    agentLogger.logCodeGeneration(
      `API route ${api.endpoint} with methods: ${api.methods.join(", ")}`,
      content
    );

    return content;
  }

  generateComponentUpdate(
    existingCode: string,
    endpoint: string,
    tableName: string
  ): string {
    agentLogger.logCodeGeneration(
      `Updating component with ${tableName} integration`,
      ""
    );

    const fetchHook = `
  const [${tableName}Data, set${this.capitalize(tableName)}Data] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetch${this.capitalize(tableName)} = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/${endpoint}');
      const data = await response.json();
      set${this.capitalize(tableName)}Data(data);
    } catch (error) {
      console.error('Failed to fetch ${tableName}:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch${this.capitalize(tableName)}();
  }, []);`;

    if (
      existingCode.includes("useState") &&
      !existingCode.includes(`${tableName}Data`)
    ) {
      const stateImportMatch = existingCode.match(
        /(import.*{[^}]*useState[^}]*}.*from.*react.*)/
      );
      if (stateImportMatch) {
        const importLine = stateImportMatch[1];
        if (!importLine.includes("useEffect")) {
          const newImport = importLine.replace(
            "useState",
            "useState, useEffect"
          );
          existingCode = existingCode.replace(importLine, newImport);
        }
      }

      const componentMatch = existingCode.match(
        /(const\s+\w+\s*=\s*\(\)\s*=>\s*{)/
      );
      if (componentMatch) {
        const insertPoint =
          existingCode.indexOf(componentMatch[1]) + componentMatch[1].length;
        existingCode =
          existingCode.slice(0, insertPoint) +
          fetchHook +
          existingCode.slice(insertPoint);
      }
    }

    agentLogger.logCodeGeneration(
      `Component update complete for ${tableName}`,
      existingCode
    );

    return existingCode;
  }

  async createSchema(schema: SchemaDefinition): Promise<void> {
    agentLogger.logAnalysis(
      `Creating schema for table: ${schema.tableName}`,
      schema.columns.length
    );

    const schemaContent = this.generateSchemaFile(schema);
    await this.writeFile({
      type: "create",
      filePath: `src/database/schemas/${schema.tableName}.ts`,
      content: schemaContent,
      backup: true,
    });

    await this.updateMainSchema(schema.tableName);
  }

  async updateMainSchema(tableName: string): Promise<void> {
    const schemaPath = "src/database/schema.ts";
    const fullPath = path.resolve(this.projectRoot, schemaPath);

    try {
      agentLogger.logFileOperation("read", schemaPath, {
        type: "schema-update",
      });
      const existingContent = await fs.readFile(fullPath, "utf-8");
      const exportLine = `export * from "./schemas/${tableName}";`;

      if (!existingContent.includes(exportLine)) {
        const updatedContent = existingContent + "\n" + exportLine;
        await this.writeFile({
          type: "update",
          filePath: schemaPath,
          content: updatedContent,
          backup: true,
        });
      }
    } catch {
      // Main schema doesn't exist or other error
      agentLogger.logAnalysis("Main schema file not found or error occurred");
    }
  }

  async createApiRoute(api: ApiRouteDefinition): Promise<void> {
    agentLogger.logAnalysis(
      `Creating API route: /api/${api.endpoint}`,
      api.methods.length
    );

    const apiContent = this.generateApiRoute(api);
    await this.writeFile({
      type: "create",
      filePath: `src/app/api/${api.endpoint}/route.ts`,
      content: apiContent,
      backup: true,
    });
  }

  async updateComponent(
    componentPath: string,
    endpoint: string,
    tableName: string
  ): Promise<void> {
    agentLogger.logAnalysis(`Updating component: ${componentPath}`);

    const fullPath = path.resolve(this.projectRoot, componentPath);

    try {
      agentLogger.logFileOperation("read", componentPath, {
        type: "component-update",
      });
      const existingCode = await fs.readFile(fullPath, "utf-8");
      const updatedCode = this.generateComponentUpdate(
        existingCode,
        endpoint,
        tableName
      );

      await this.writeFile({
        type: "update",
        filePath: componentPath,
        content: updatedCode,
        backup: true,
      });
    } catch (error) {
      console.warn(`Could not update component ${componentPath}:`, error);
    }
  }

  async createComponent(
    componentPath: string,
    endpoint: string,
    tableName: string
  ): Promise<void> {
    agentLogger.logAnalysis(`Creating new component: ${componentPath}`);

    const componentName = this.getComponentNameFromPath(componentPath);
    const componentContent = this.generateNewComponent(
      componentName,
      endpoint,
      tableName
    );

    await this.writeFile({
      type: "create",
      filePath: componentPath,
      content: componentContent,
      backup: false,
    });
  }

  private getComponentNameFromPath(componentPath: string): string {
    const fileName = path.basename(componentPath, ".tsx");
    return fileName
      .split("-")
      .map((word) => this.capitalize(word))
      .join("");
  }

  private generateNewComponent(
    componentName: string,
    endpoint: string,
    tableName: string
  ): string {
    agentLogger.logCodeGeneration(
      `Generating new React component: ${componentName}`,
      ""
    );

    const capitalizedTableName = this.capitalize(tableName);

    const content = `"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ${capitalizedTableName}Item {
  id: number;
  createdAt: string;
  updatedAt: string;
  // Add other fields based on your schema
}

export default function ${componentName}() {
  const [${tableName}Data, set${capitalizedTableName}Data] = useState<${capitalizedTableName}Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch${capitalizedTableName} = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/${endpoint}');
      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }
      const data = await response.json();
      set${capitalizedTableName}Data(data);
    } catch (error) {
      console.error('Failed to fetch ${tableName}:', error);
      setError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const create${capitalizedTableName} = async (data: Partial<${capitalizedTableName}Item>) => {
    try {
      const response = await fetch('/api/${endpoint}', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('Failed to create item');
      }

      await fetch${capitalizedTableName}(); // Refresh the list
    } catch (error) {
      console.error('Failed to create ${tableName}:', error);
      setError(error instanceof Error ? error.message : 'Failed to create item');
    }
  };

  const delete${capitalizedTableName} = async (id: number) => {
    try {
      const response = await fetch(\`/api/${endpoint}?id=\${id}\`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete item');
      }

      await fetch${capitalizedTableName}(); // Refresh the list
    } catch (error) {
      console.error('Failed to delete ${tableName}:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete item');
    }
  };

  useEffect(() => {
    fetch${capitalizedTableName}();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-red-500">Error: {error}</div>
          <Button onClick={fetch${capitalizedTableName}} className="mt-4">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>${componentName}</CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={() => create${capitalizedTableName}({})}>
            Add New Item
          </Button>

          <div className="mt-4 space-y-2">
            {${tableName}Data.length === 0 ? (
              <p className="text-gray-500">No items found</p>
            ) : (
              ${tableName}Data.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-2 border rounded">
                  <span>Item #{item.id}</span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => delete${capitalizedTableName}(item.id)}
                  >
                    Delete
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}`;

    agentLogger.logCodeGeneration(
      `React component ${componentName} completed`,
      content
    );

    return content;
  }

  async runMigration(): Promise<void> {
    agentLogger.logAnalysis("Running database migration");

    try {
      await exec("npx drizzle-kit generate");
      await exec("npx drizzle-kit push");
      agentLogger.logAnalysis("Database migration completed successfully");
    } catch (error) {
      throw new Error(`Migration failed: ${error}`);
    }
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
