import { promises as fs } from "fs";
import path from "path";
import type { ProjectContext, DatabaseSchema } from "../types.js";

export async function analyzeProject(): Promise<ProjectContext> {
  return {
    framework: await detectFramework(),
    hasTypeScript: await hasTypeScript(),
    structure: await analyzeStructure(),
    database: await analyzeDatabaseSetup(),
    existingSchemas: await findExistingSchemas(),
    apiRoutes: await findApiRoutes(),
    components: await findComponents(),
    dependencies: await analyzeDependencies(),
  };
}

async function detectFramework(): Promise<string> {
  const packageJson = await readPackageJson();
  if (packageJson?.dependencies?.next) return "nextjs";
  if (packageJson?.dependencies?.react) return "react";
  return "unknown";
}

async function hasTypeScript(): Promise<boolean> {
  try {
    await fs.access("./tsconfig.json");
    return true;
  } catch {
    return false;
  }
}

async function analyzeStructure(): Promise<Record<string, string[]>> {
  const structure: Record<string, string[]> = {};
  const directories = [
    "src/app",
    "src/pages",
    "src/components",
    "src/lib",
    "pages",
    "components",
  ];

  for (const dir of directories) {
    try {
      const files = await getFilesRecursively(dir);
      if (files.length > 0) {
        structure[dir] = files;
      }
    } catch {
      // Directory doesn't exist
    }
  }

  return structure;
}

async function analyzeDatabaseSetup() {
  const packageJson = await readPackageJson();

  if (packageJson?.dependencies?.["drizzle-orm"]) {
    return {
      provider: "postgres",
      schemas: await findSchemaFiles(),
    };
  }

  return null;
}

async function findExistingSchemas(): Promise<DatabaseSchema[]> {
  const schemas: DatabaseSchema[] = [];
  const schemaDir = "src/database/schemas";

  try {
    const files = await fs.readdir(schemaDir);

    for (const file of files) {
      if (file.endsWith(".ts")) {
        const content = await fs.readFile(path.join(schemaDir, file), "utf-8");
        const schema = parseSchemaFile(content, file);
        if (schema) schemas.push(schema);
      }
    }
  } catch {
    // Schema directory doesn't exist
  }

  return schemas;
}

async function findApiRoutes(): Promise<string[]> {
  const routes: string[] = [];
  const apiDir = "src/app/api";

  try {
    const files = await getFilesRecursively(apiDir);
    routes.push(
      ...files.filter(
        (file) => file.endsWith("route.ts") || file.endsWith("route.js")
      )
    );
  } catch {
    // API directory doesn't exist
  }

  return routes;
}

async function findComponents(): Promise<string[]> {
  const components: string[] = [];
  const componentDirs = ["src/components", "components"];

  for (const dir of componentDirs) {
    try {
      const files = await getFilesRecursively(dir);
      components.push(
        ...files.filter(
          (file) => file.endsWith(".tsx") || file.endsWith(".jsx")
        )
      );
    } catch {
      // Component directory doesn't exist
    }
  }

  return components;
}

async function analyzeDependencies(): Promise<Record<string, string>> {
  const packageJson = await readPackageJson();
  return {
    ...(packageJson?.dependencies || {}),
    ...(packageJson?.devDependencies || {}),
  };
}

async function readPackageJson(): Promise<any> {
  try {
    const content = await fs.readFile("./package.json", "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function getFilesRecursively(dir: string): Promise<string[]> {
  const files: string[] = [];

  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const subFiles = await getFilesRecursively(fullPath);
      files.push(...subFiles);
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

async function findSchemaFiles(): Promise<string[]> {
  const schemaFiles: string[] = [];
  const possibleDirs = [
    "src/database/schemas",
    "src/db/schemas",
    "database/schemas",
  ];

  for (const dir of possibleDirs) {
    try {
      const files = await getFilesRecursively(dir);
      schemaFiles.push(...files.filter((file) => file.endsWith(".ts")));
    } catch {
      // Directory doesn't exist
    }
  }

  return schemaFiles;
}

function parseSchemaFile(
  content: string,
  filename: string
): DatabaseSchema | null {
  try {
    const tableMatches = content.match(
      /export const (\w+) = (?:pgTable|mysqlTable|sqliteTable)/g
    );

    if (tableMatches) {
      const tables = tableMatches
        .map((match) => {
          const tableName = match.match(/export const (\w+)/)?.[1];
          return tableName || "";
        })
        .filter(Boolean);

      return {
        name: filename.replace(".ts", ""),
        tables,
        path: filename,
      };
    }
  } catch {
    // Failed to parse schema
  }

  return null;
}
