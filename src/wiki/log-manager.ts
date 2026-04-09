import path from "node:path";
import { appendToFile } from "../vault/writer.js";

export type LogOperation = "create_domain" | "ingest" | "promote" | "link" | "delete" | "remember" | "forget";

export function logEntry(
  vaultPath: string,
  operation: LogOperation,
  detail: string,
): void {
  const timestamp = new Date().toISOString();
  const line = `\n- \`${timestamp}\` **${operation}** — ${detail}`;
  appendToFile(path.join(vaultPath, "log.md"), line);
}
