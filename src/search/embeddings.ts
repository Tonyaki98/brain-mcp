import type Database from "better-sqlite3";
import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";
const EMBEDDING_DIM = 384;

let extractor: FeatureExtractionPipeline | null = null;
let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

/**
 * Lazily initialize the embedding model.
 * The model downloads once and is cached in ~/.cache/huggingface.
 */
export async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (extractor) return extractor;
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", MODEL_NAME, {
      quantized: true,
    }).then((ext) => {
      extractor = ext;
      return ext;
    });
  }
  return extractorPromise;
}

/**
 * Generate an embedding vector for the given text.
 * Truncates to model's max token length automatically.
 */
export async function generateEmbedding(text: string): Promise<Float32Array> {
  const ext = await getExtractor();
  const output = await ext(text, { pooling: "mean", normalize: true });
  return new Float32Array(output.data as Float32Array);
}

/**
 * Serialize Float32Array to Buffer for SQLite BLOB storage.
 */
function embeddingToBuffer(embedding: Float32Array): Buffer {
  return Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
}

/**
 * Deserialize Buffer from SQLite BLOB to Float32Array.
 */
function bufferToEmbedding(buf: Buffer): Float32Array {
  const ab = new ArrayBuffer(buf.length);
  const view = new Uint8Array(ab);
  view.set(buf);
  return new Float32Array(ab);
}

/**
 * Store an embedding for a page. Replaces existing if present.
 */
export function storeEmbedding(
  db: Database.Database,
  pageId: string,
  embedding: Float32Array,
): void {
  db.prepare(
    `INSERT OR REPLACE INTO embeddings (page_id, embedding, updated_at)
     VALUES (?, ?, ?)`,
  ).run(pageId, embeddingToBuffer(embedding), new Date().toISOString());
}

/**
 * Remove an embedding for a page.
 */
export function removeEmbedding(db: Database.Database, pageId: string): void {
  db.prepare("DELETE FROM embeddings WHERE page_id = ?").run(pageId);
}

/**
 * Cosine similarity between two normalized vectors.
 * Since vectors are already L2-normalized, dot product = cosine similarity.
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

export interface SemanticResult {
  id: string;
  title: string;
  content: string;
  tags: string | null;
  score: number;
}

/**
 * Perform semantic search: compute cosine similarity between query embedding
 * and all stored embeddings, return top results.
 */
export function semanticSearch(
  db: Database.Database,
  queryEmbedding: Float32Array,
  options?: { domain?: string; category?: string; maxResults?: number },
): SemanticResult[] {
  const max = options?.maxResults ?? 10;

  let sql = `
    SELECT e.page_id, e.embedding, p.title, p.content, p.tags
    FROM embeddings e
    JOIN pages p ON p.id = e.page_id
  `;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options?.domain) {
    conditions.push("p.domain = ?");
    params.push(options.domain);
  }
  if (options?.category) {
    conditions.push("p.category = ?");
    params.push(options.category);
  }
  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  const rows = db.prepare(sql).all(...params) as Array<{
    page_id: string;
    embedding: Buffer;
    title: string;
    content: string;
    tags: string | null;
  }>;

  const scored: SemanticResult[] = rows.map((row) => ({
    id: row.page_id,
    title: row.title,
    content: row.content,
    tags: row.tags,
    score: cosineSimilarity(queryEmbedding, bufferToEmbedding(row.embedding)),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, max);
}

/**
 * Check if an embedding exists and is up-to-date for a page.
 */
export function hasEmbedding(db: Database.Database, pageId: string, updatedAt: string): boolean {
  const row = db.prepare(
    "SELECT updated_at FROM embeddings WHERE page_id = ?",
  ).get(pageId) as { updated_at: string } | undefined;
  return row?.updated_at === updatedAt;
}
