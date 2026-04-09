import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import type { VaultDiscovery } from "../vault/discovery.js";
import { writePage } from "../vault/writer.js";
import { regenerateIndex } from "../wiki/index-manager.js";
import { logEntry } from "../wiki/log-manager.js";

const DEFAULT_CATEGORIES = ["concepts", "decisions", "patterns", "sources"];

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  concepts: "Mecanismos, abstracciones core y definiciones",
  decisions: "Decisiones tomadas con contexto y razones",
  patterns: "Patrones recurrentes y soluciones probadas",
  sources: "Material de referencia, artículos, documentación",
};

const CATEGORY_PAGE_TYPES: Record<string, string[]> = {
  concepts: ["definition", "mechanism", "comparison", "gotcha"],
  decisions: ["decision", "tradeoff", "migration"],
  patterns: ["pattern", "recipe", "template"],
  sources: ["reference", "article", "book", "video"],
};

export function createDomain(
  vaultPath: string,
  discovery: VaultDiscovery,
  db: Database.Database,
  input: {
    name: string;
    description: string;
    emoji?: string;
    categories?: string[];
  },
): string {
  const { name, description, emoji } = input;
  const categories = input.categories ?? DEFAULT_CATEGORIES;

  if (discovery.domainExists(name)) {
    return `El dominio "${name}" ya existe.`;
  }

  const domainPath = path.join(vaultPath, name);
  const now = new Date().toISOString().split("T")[0];

  // Domain _schema.md
  writePage(
    path.join(domainPath, "_schema.md"),
    {
      type: "domain",
      name,
      description,
      emoji: emoji ?? "",
      categories,
      tags: [],
      created: now,
    },
    `# ${emoji ?? ""} ${name}\n\n${description}\n`,
  );

  // Category folders and schemas
  for (const cat of categories) {
    writePage(
      path.join(domainPath, cat, "_schema.md"),
      {
        type: "category",
        domain: name,
        category: cat,
        description: CATEGORY_DESCRIPTIONS[cat] ?? `Categoría ${cat}`,
        page_types: CATEGORY_PAGE_TYPES[cat] ?? [],
      },
      "",
    );
  }

  // sources/raw/ always
  const rawPath = path.join(domainPath, "sources", "raw");
  if (!fs.existsSync(rawPath)) {
    fs.mkdirSync(rawPath, { recursive: true });
  }

  // Register in SQLite
  db.prepare(`
    INSERT OR REPLACE INTO domains (name, description, emoji, categories, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, description, emoji ?? null, JSON.stringify(categories), new Date().toISOString());

  // Reload discovery, update index, log
  void discovery.reload();
  regenerateIndex(vaultPath, discovery);
  logEntry(vaultPath, "create_domain", `Dominio ${emoji ?? ""} ${name} creado con categorías: ${categories.join(", ")}`);

  return `Dominio ${emoji ?? ""} ${name} creado con ${categories.length} categorías: ${categories.join(", ")}`;
}
