import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { writePage, toKebabCase } from "../vault/writer.js";
import { indexPage } from "../search/fts.js";
import { logEntry } from "../wiki/log-manager.js";

export interface RememberInput {
  title: string;
  content: string;
  tags?: string[];
  expires?: string; // ISO date string, optional
}

export function remember(
  vaultPath: string,
  db: Database.Database,
  input: RememberInput,
): string {
  const ephemeralDir = path.join(vaultPath, "_ephemeral");
  if (!fs.existsSync(ephemeralDir)) {
    fs.mkdirSync(ephemeralDir, { recursive: true });
  }

  const filename = toKebabCase(input.title) + ".md";
  const filePath = path.join(ephemeralDir, filename);
  const pageId = `_ephemeral/${toKebabCase(input.title)}`;
  const now = new Date().toISOString();

  const frontmatter: Record<string, unknown> = {
    title: input.title,
    type: "ephemeral",
    tags: input.tags ?? [],
    created: now,
    updated: now,
  };

  if (input.expires) {
    frontmatter.expires = input.expires;
  }

  const fullContent = `\n# ${input.title}\n\n${input.content}`;

  writePage(filePath, frontmatter, fullContent);

  // Index in SQLite for query
  indexPage(db, {
    id: pageId,
    domain: "_ephemeral",
    category: "memory",
    title: input.title,
    filename,
    path: filePath,
    page_type: "ephemeral",
    tags: input.tags ? JSON.stringify(input.tags) : null,
    source: "ephemeral",
    created_at: now,
    updated_at: now,
    content: input.content,
  });

  logEntry(vaultPath, "remember", `${pageId} — "${input.title}"`);

  const expiresMsg = input.expires
    ? ` (expira: ${input.expires})`
    : " (sin expiración, vive hasta que la borres)";

  return `Memoria guardada en ${pageId}${expiresMsg}`;
}
