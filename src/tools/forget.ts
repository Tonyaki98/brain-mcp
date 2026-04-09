import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { toKebabCase } from "../vault/writer.js";
import { removePage } from "../search/fts.js";
import { logEntry } from "../wiki/log-manager.js";

export interface ForgetInput {
  title?: string; // Specific memory to forget
  clear_expired?: boolean; // Remove all expired memories
}

export function forget(
  vaultPath: string,
  db: Database.Database,
  input: ForgetInput,
): string {
  const ephemeralDir = path.join(vaultPath, "_ephemeral");
  if (!fs.existsSync(ephemeralDir)) {
    return "No hay memorias efímeras.";
  }

  const results: string[] = [];

  // Forget specific memory by title
  if (input.title) {
    const filename = toKebabCase(input.title) + ".md";
    const filePath = path.join(ephemeralDir, filename);
    const pageId = `_ephemeral/${toKebabCase(input.title)}`;

    if (!fs.existsSync(filePath)) {
      return `No se encontró la memoria "${input.title}".`;
    }

    fs.unlinkSync(filePath);
    removePage(db, pageId);
    logEntry(vaultPath, "forget", `${pageId} — "${input.title}"`);
    results.push(`Olvidada: "${input.title}"`);
  }

  // Clear all expired memories
  if (input.clear_expired) {
    const now = new Date();
    const files = fs.readdirSync(ephemeralDir).filter(f => f.endsWith(".md"));

    for (const file of files) {
      const filePath = path.join(ephemeralDir, file);
      const content = fs.readFileSync(filePath, "utf-8");

      // Quick frontmatter parse for expires field
      const expiresMatch = content.match(/^expires:\s*['"]?(.+?)['"]?\s*$/m);
      if (!expiresMatch) continue;

      const expiresDate = new Date(expiresMatch[1]);
      if (expiresDate <= now) {
        const pageId = `_ephemeral/${file.replace(/\.md$/, "")}`;
        fs.unlinkSync(filePath);
        removePage(db, pageId);
        logEntry(vaultPath, "forget", `${pageId} — expirada`);
        results.push(`Expirada y eliminada: ${file.replace(/\.md$/, "")}`);
      }
    }

    if (results.length === 0 && !input.title) {
      return "No hay memorias expiradas.";
    }
  }

  if (results.length === 0) {
    return "No se especificó qué olvidar. Usa `title` para una memoria específica o `clear_expired` para limpiar expiradas.";
  }

  return results.join("\n");
}
