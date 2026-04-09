import type Database from "better-sqlite3";
import { generateEmbedding, storeEmbedding, semanticSearch } from "./embeddings.js";

export interface PageRecord {
  id: string;
  domain: string;
  category: string;
  title: string;
  filename: string;
  path: string;
  page_type: string | null;
  tags: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
  content: string;
}

export interface SearchResult {
  id: string;
  title: string;
  content: string;
  tags: string | null;
  rank: number;
}

export interface SearchMeta {
  mode: "hybrid" | "fts-only";
  ftsHits: number;
  semanticHits: number;
  totalReturned: number;
  topResult: string | null;
}

export interface SearchResponse {
  results: SearchResult[];
  meta: SearchMeta;
}

export function indexPage(db: Database.Database, page: PageRecord): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO pages (id, domain, category, title, filename, path, page_type, tags, source, created_at, updated_at, content)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    page.id, page.domain, page.category, page.title, page.filename,
    page.path, page.page_type, page.tags, page.source,
    page.created_at, page.updated_at, page.content,
  );
}

/**
 * Index a page and generate its embedding asynchronously.
 * Call this instead of indexPage when you want embeddings too.
 */
export async function indexPageWithEmbedding(db: Database.Database, page: PageRecord): Promise<void> {
  indexPage(db, page);
  const textForEmbedding = `${page.title} ${page.tags ?? ""} ${page.content}`.slice(0, 1000);
  const embedding = await generateEmbedding(textForEmbedding);
  storeEmbedding(db, page.id, embedding);
}

/**
 * Sanitize a user query for FTS5 MATCH syntax.
 * Wraps each token in double-quotes so that special characters
 * like `-` (NOT operator) and `*` are treated as literals.
 */
function sanitizeFtsQuery(raw: string): string {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '""';
  return tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(" ");
}

function ftsSearch(
  db: Database.Database,
  query: string,
  options?: { domain?: string; category?: string; maxResults?: number },
): SearchResult[] {
  const max = options?.maxResults ?? 10;
  const ftsQuery = sanitizeFtsQuery(query);
  let sql = `
    SELECT pages_fts.id, pages_fts.title, pages_fts.content, pages_fts.tags, rank
    FROM pages_fts
    JOIN pages ON pages.id = pages_fts.id
    WHERE pages_fts MATCH ?
  `;
  const params: unknown[] = [ftsQuery];

  if (options?.domain) {
    sql += " AND pages.domain = ?";
    params.push(options.domain);
  }
  if (options?.category) {
    sql += " AND pages.category = ?";
    params.push(options.category);
  }
  sql += " ORDER BY rank LIMIT ?";
  params.push(max);

  return db.prepare(sql).all(...params) as SearchResult[];
}

/**
 * Hybrid search: combines FTS5 keyword search with semantic embedding search.
 * FTS weight: 0.4, Semantic weight: 0.6
 */
export async function searchPages(
  db: Database.Database,
  query: string,
  options?: { domain?: string; category?: string; maxResults?: number },
): Promise<SearchResponse> {
  const max = options?.maxResults ?? 5;
  const FTS_WEIGHT = 0.4;
  const SEMANTIC_WEIGHT = 0.6;

  // Run FTS5 search (always available)
  const ftsResults = ftsSearch(db, query, { ...options, maxResults: max * 2 });

  // Try semantic search
  let queryEmbedding: Float32Array | null = null;
  try {
    queryEmbedding = await generateEmbedding(query);
  } catch {
    // Model not ready yet, fall back to FTS only
    const results = ftsResults.slice(0, max);
    return {
      results,
      meta: {
        mode: "fts-only",
        ftsHits: ftsResults.length,
        semanticHits: 0,
        totalReturned: results.length,
        topResult: results[0]?.id ?? null,
      },
    };
  }

  const semanticResults = semanticSearch(db, queryEmbedding, {
    domain: options?.domain,
    category: options?.category,
    maxResults: max * 2,
  });

  // Normalize FTS ranks to 0-1 (rank is negative, more negative = better)
  const ftsMin = ftsResults.length > 0 ? Math.min(...ftsResults.map((r) => r.rank)) : 0;
  const ftsMax = ftsResults.length > 0 ? Math.max(...ftsResults.map((r) => r.rank)) : 0;
  const ftsRange = ftsMax - ftsMin || 1;

  const scoreMap = new Map<string, { result: SearchResult; score: number }>();

  for (const r of ftsResults) {
    const normalizedFts = 1 - (r.rank - ftsMin) / ftsRange; // 0-1, higher = better
    scoreMap.set(r.id, {
      result: r,
      score: normalizedFts * FTS_WEIGHT,
    });
  }

  for (const r of semanticResults) {
    const semanticScore = Math.max(0, r.score); // already 0-1
    const existing = scoreMap.get(r.id);
    if (existing) {
      existing.score += semanticScore * SEMANTIC_WEIGHT;
    } else {
      scoreMap.set(r.id, {
        result: { id: r.id, title: r.title, content: r.content, tags: r.tags, rank: -semanticScore },
        score: semanticScore * SEMANTIC_WEIGHT,
      });
    }
  }

  const combined = [...scoreMap.values()];
  combined.sort((a, b) => b.score - a.score);
  const results = combined.slice(0, max).map((entry) => entry.result);

  return {
    results,
    meta: {
      mode: "hybrid",
      ftsHits: ftsResults.length,
      semanticHits: semanticResults.length,
      totalReturned: results.length,
      topResult: results[0]?.id ?? null,
    },
  };
}

export function removePage(db: Database.Database, pageId: string): void {
  db.prepare("DELETE FROM pages WHERE id = ?").run(pageId);
}

export function getPage(db: Database.Database, pageId: string): PageRecord | undefined {
  return db.prepare("SELECT * FROM pages WHERE id = ?").get(pageId) as PageRecord | undefined;
}
