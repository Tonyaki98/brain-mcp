import path from "node:path";
import { watch } from "chokidar";
import type Database from "better-sqlite3";
import type { VaultDiscovery } from "./discovery.js";
import { readPage } from "./reader.js";
import { indexPage, removePage } from "../search/fts.js";
import { removeEdgesForPage } from "./linker.js";

function pageIdFromPath(vaultPath: string, filePath: string): string {
  const rel = path.relative(vaultPath, filePath);
  return rel.replace(/\.md$/, "").replace(/\\/g, "/");
}

function isSchema(filePath: string): boolean {
  return path.basename(filePath) === "_schema.md";
}

export function startWatcher(
  vaultPath: string,
  discovery: VaultDiscovery,
  db: Database.Database,
): void {
  const watcher = watch(vaultPath, {
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 300 },
  });

  function indexFile(filePath: string): void {
    if (!filePath.endsWith(".md") || isSchema(filePath)) return;
    try {
      const data = readPage(filePath);
      const id = pageIdFromPath(vaultPath, filePath);
      const parts = id.split("/");
      if (parts.length < 3) return;

      indexPage(db, {
        id,
        domain: parts[0],
        category: parts[1],
        title: (data.frontmatter.title as string) ?? parts[2],
        filename: path.basename(filePath),
        path: filePath,
        page_type: (data.frontmatter.page_type as string) ?? null,
        tags: data.frontmatter.tags ? JSON.stringify(data.frontmatter.tags) : null,
        source: (data.frontmatter.source as string) ?? null,
        created_at: (data.frontmatter.created as string) ?? new Date().toISOString(),
        updated_at: (data.frontmatter.updated as string) ?? new Date().toISOString(),
        content: data.content,
      });
    } catch {
      // File might be mid-write, ignore
    }
  }

  watcher.on("add", (filePath) => {
    if (isSchema(filePath)) {
      void discovery.reload();
    } else {
      indexFile(filePath);
    }
  });

  watcher.on("change", (filePath) => {
    if (isSchema(filePath)) {
      void discovery.reload();
    } else {
      indexFile(filePath);
    }
  });

  watcher.on("unlink", (filePath) => {
    if (isSchema(filePath)) {
      void discovery.reload();
    } else if (filePath.endsWith(".md")) {
      const id = pageIdFromPath(vaultPath, filePath);
      removePage(db, id);
      removeEdgesForPage(db, id);
    }
  });
}
