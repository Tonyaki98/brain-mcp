import fs from "node:fs";
import path from "node:path";
import { readPage } from "./reader.js";

export interface CategoryInfo {
  name: string;
  description: string;
  pageTypes: string[];
}

export interface DomainInfo {
  name: string;
  description: string;
  emoji: string;
  tags: string[];
  categories: Map<string, CategoryInfo>;
  createdAt: string;
}

export interface VaultDiscovery {
  getDomains(): DomainInfo[];
  getDomain(name: string): DomainInfo | undefined;
  getCategory(domain: string, category: string): CategoryInfo | undefined;
  domainExists(name: string): boolean;
  categoryExists(domain: string, category: string): boolean;
  reload(): Promise<void>;
}

export function createDiscovery(vaultPath: string): VaultDiscovery {
  const domains = new Map<string, DomainInfo>();

  function scan(): void {
    domains.clear();
    if (!fs.existsSync(vaultPath)) return;

    const entries = fs.readdirSync(vaultPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith("_") || entry.name.startsWith(".")) continue;

      const domainPath = path.join(vaultPath, entry.name);
      const schemaPath = path.join(domainPath, "_schema.md");
      if (!fs.existsSync(schemaPath)) continue;

      const schema = readPage(schemaPath);
      if (schema.frontmatter.type !== "domain") continue;

      const categories = new Map<string, CategoryInfo>();

      const subEntries = fs.readdirSync(domainPath, { withFileTypes: true });
      for (const sub of subEntries) {
        if (!sub.isDirectory()) continue;
        const catSchemaPath = path.join(domainPath, sub.name, "_schema.md");
        if (!fs.existsSync(catSchemaPath)) continue;

        const catSchema = readPage(catSchemaPath);
        if (catSchema.frontmatter.type !== "category") continue;

        categories.set(sub.name, {
          name: sub.name,
          description: (catSchema.frontmatter.description as string) ?? "",
          pageTypes: (catSchema.frontmatter.page_types as string[]) ?? [],
        });
      }

      domains.set(entry.name, {
        name: entry.name,
        description: (schema.frontmatter.description as string) ?? "",
        emoji: (schema.frontmatter.emoji as string) ?? "",
        tags: (schema.frontmatter.tags as string[]) ?? [],
        categories,
        createdAt: (schema.frontmatter.created as string) ?? new Date().toISOString(),
      });
    }
  }

  // Initial scan
  scan();

  return {
    getDomains: () => Array.from(domains.values()),
    getDomain: (name) => domains.get(name),
    getCategory: (domain, category) => domains.get(domain)?.categories.get(category),
    domainExists: (name) => domains.has(name),
    categoryExists: (domain, category) => domains.get(domain)?.categories.has(category) ?? false,
    reload: async () => { scan(); },
  };
}
