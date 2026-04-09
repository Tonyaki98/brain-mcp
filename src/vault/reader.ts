import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export interface PageData {
  frontmatter: Record<string, unknown>;
  content: string;
  path: string;
}

export function readPage(filePath: string): PageData {
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = matter(raw);
  return {
    frontmatter: parsed.data,
    content: parsed.content.trim(),
    path: filePath,
  };
}

export function readAllPages(dirPath: string): PageData[] {
  const pages: PageData[] = [];
  if (!fs.existsSync(dirPath)) return pages;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isFile() && entry.name.endsWith(".md") && !entry.name.startsWith("_")) {
      pages.push(readPage(fullPath));
    }
  }
  return pages;
}

export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}
