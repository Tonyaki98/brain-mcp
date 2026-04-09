import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export function writePage(
  filePath: string,
  frontmatter: Record<string, unknown>,
  content: string,
): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const output = matter.stringify(content, frontmatter);
  fs.writeFileSync(filePath, output, "utf-8");
}

export function appendToFile(filePath: string, text: string): void {
  fs.appendFileSync(filePath, text, "utf-8");
}

export function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
