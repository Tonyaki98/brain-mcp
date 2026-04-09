import fs from "node:fs";
import path from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { initDB } from "./db/schema.js";
import { createDiscovery } from "./vault/discovery.js";
import { startWatcher } from "./vault/watcher.js";
import { createMcpServer } from "./server/mcp.js";
import { writePage } from "./vault/writer.js";

const projectRoot = path.resolve(import.meta.dirname, "..");
const vaultPath = process.env.VAULT_PATH ?? path.join(projectRoot, "vault");
const dbPath = process.env.DB_PATH ?? path.join(projectRoot, "data", "brain.db");

// Ensure directories exist
fs.mkdirSync(vaultPath, { recursive: true });
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// Initialize vault base files if missing
const brainMdPath = path.join(vaultPath, "_brain.md");
if (!fs.existsSync(brainMdPath)) {
  writePage(brainMdPath, {
    version: "1.0",
    owner: "Anto",
    language: "es",
    default_categories: ["concepts", "decisions", "patterns", "sources"],
    compact_after: 50,
  }, "\n# Brain\n\nCerebro compartido entre todas las IAs.\nGestiona conocimiento en dominios independientes con links entre ellos.\n");
}

const indexMdPath = path.join(vaultPath, "index.md");
if (!fs.existsSync(indexMdPath)) {
  fs.writeFileSync(indexMdPath, "---\ntitle: Index\ntype: index\n---\n\n# Brain Index\n\n_No hay dominios aún. Usa `create_domain` para empezar._\n", "utf-8");
}

const logMdPath = path.join(vaultPath, "log.md");
if (!fs.existsSync(logMdPath)) {
  fs.writeFileSync(logMdPath, "---\ntitle: Log\ntype: log\n---\n\n# Brain Log\n", "utf-8");
}

// Ensure _ephemeral directory exists
const ephemeralPath = path.join(vaultPath, "_ephemeral");
fs.mkdirSync(ephemeralPath, { recursive: true });

// Init DB
const db = initDB(dbPath);

// Init discovery
const discovery = createDiscovery(vaultPath);

// Re-index existing pages on startup
import { readPage } from "./vault/reader.js";
import { indexPage } from "./search/fts.js";

function reindexVault(): void {
  // Rebuild FTS5 index to fix any corruption (e.g. "fts5: missing row")
  db.exec("INSERT INTO pages_fts(pages_fts) VALUES('rebuild')");

  const domains = discovery.getDomains();
  for (const domain of domains) {
    for (const [catName] of domain.categories) {
      const catPath = path.join(vaultPath, domain.name, catName);
      if (!fs.existsSync(catPath)) continue;
      const entries = fs.readdirSync(catPath).filter(f => f.endsWith(".md") && !f.startsWith("_"));
      for (const file of entries) {
        const filePath = path.join(catPath, file);
        try {
          const data = readPage(filePath);
          const pageId = `${domain.name}/${catName}/${file.replace(/\.md$/, "")}`;
          indexPage(db, {
            id: pageId,
            domain: domain.name,
            category: catName,
            title: (data.frontmatter.title as string) ?? file.replace(/\.md$/, ""),
            filename: file,
            path: filePath,
            page_type: (data.frontmatter.page_type as string) ?? null,
            tags: data.frontmatter.tags ? JSON.stringify(data.frontmatter.tags) : null,
            source: (data.frontmatter.source as string) ?? null,
            created_at: (data.frontmatter.created as string) ?? new Date().toISOString(),
            updated_at: (data.frontmatter.updated as string) ?? new Date().toISOString(),
            content: data.content,
          });
        } catch {
          // Skip files that can't be parsed
        }
      }
    }
  }

  // Re-index ephemeral memories
  if (fs.existsSync(ephemeralPath)) {
    const ephFiles = fs.readdirSync(ephemeralPath).filter(f => f.endsWith(".md"));
    for (const file of ephFiles) {
      const filePath = path.join(ephemeralPath, file);
      try {
        const data = readPage(filePath);
        const pageId = `_ephemeral/${file.replace(/\.md$/, "")}`;
        indexPage(db, {
          id: pageId,
          domain: "_ephemeral",
          category: "memory",
          title: (data.frontmatter.title as string) ?? file.replace(/\.md$/, ""),
          filename: file,
          path: filePath,
          page_type: "ephemeral",
          tags: data.frontmatter.tags ? JSON.stringify(data.frontmatter.tags) : null,
          source: "ephemeral",
          created_at: (data.frontmatter.created as string) ?? new Date().toISOString(),
          updated_at: (data.frontmatter.updated as string) ?? new Date().toISOString(),
          content: data.content,
        });
      } catch {
        // Skip files that can't be parsed
      }
    }
  }
}

reindexVault();

// Start watcher
startWatcher(vaultPath, discovery, db);

// Create and start MCP server
const server = createMcpServer(vaultPath, discovery, db);
const transport = new StdioServerTransport();
await server.connect(transport);
