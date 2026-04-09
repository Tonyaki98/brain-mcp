import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type Database from "better-sqlite3";
import type { VaultDiscovery } from "../vault/discovery.js";
import { SessionManager } from "../wiki/session-manager.js";
import { listDomains } from "../tools/list-domains.js";
import { createDomain } from "../tools/create-domain.js";
import { ingest } from "../tools/ingest.js";
import { query } from "../tools/query.js";
import { promote } from "../tools/promote.js";
import { link } from "../tools/link.js";
import { lint } from "../tools/lint.js";
import { remember } from "../tools/remember.js";
import { forget } from "../tools/forget.js";
import { checkStaleEphemeral } from "../ephemeral/stale-check.js";

export function createMcpServer(
  vaultPath: string,
  discovery: VaultDiscovery,
  db: Database.Database,
): McpServer {
  const server = new McpServer({
    name: "brain-mcp",
    version: "1.0.0",
  });

  const session = new SessionManager(vaultPath);

  /** Appends stale ephemeral warnings to tool responses */
  function withStaleCheck(result: string): string {
    const staleWarning = checkStaleEphemeral(vaultPath);
    return staleWarning ? result + staleWarning : result;
  }

  // list_domains
  server.tool(
    "list_domains",
    "Lista todos los dominios de conocimiento con estadísticas",
    {},
    async () => {
      const result = listDomains(vaultPath, discovery, db);
      session.log("list_domains", `${discovery.getDomains().length} dominios`);
      return { content: [{ type: "text", text: withStaleCheck(result) }] };
    },
  );

  // create_domain
  server.tool(
    "create_domain",
    "Crea un nuevo dominio de conocimiento con su estructura de carpetas",
    {
      name: z.string().describe("Nombre del dominio (ej: kotlin, historia, cocina)"),
      description: z.string().describe("Qué conocimiento vive en este dominio"),
      emoji: z.string().optional().describe("Emoji representativo"),
      categories: z.array(z.string()).optional().describe("Categorías (default: concepts, decisions, patterns, sources)"),
    },
    async (input) => {
      const result = createDomain(vaultPath, discovery, db, input);
      session.log("create_domain", `${input.name}`);
      session.trackPageCreated(`${input.name}/_schema`);
      return { content: [{ type: "text", text: withStaleCheck(result) }] };
    },
  );

  // ingest
  server.tool(
    "ingest",
    "Integra conocimiento nuevo al vault. Crea una página .md con frontmatter y la indexa",
    {
      content: z.string().describe("El conocimiento a integrar"),
      domain: z.string().describe("Dominio destino"),
      category: z.string().describe("Categoría destino"),
      title: z.string().describe("Título de la página"),
      page_type: z.string().optional().describe("Tipo: mechanism, pattern, decision, gotcha, etc."),
      source: z.string().optional().describe("Origen: claude-code-session, article, manual"),
      tags: z.array(z.string()).optional().describe("Tags para búsqueda"),
      related_to: z.array(z.object({
        domain: z.string(),
        category: z.string(),
        page: z.string(),
        relation: z.string().describe("related_to | evolved_into | depends_on | supports | contradicts | supersedes"),
        note: z.string().optional(),
      })).optional().describe("Links a páginas existentes"),
    },
    async (input) => {
      const result = ingest(vaultPath, discovery, db, input);
      session.log("ingest", `${input.domain}/${input.category}/${input.title}`);
      session.trackPageCreated(`${input.domain}/${input.category}/${input.title}`);
      return { content: [{ type: "text", text: withStaleCheck(result) }] };
    },
  );

  // query
  server.tool(
    "query",
    "Busca en el vault usando full-text search y devuelve páginas relevantes con su contenido completo",
    {
      question: z.string().describe("Texto de búsqueda"),
      domain: z.string().optional().describe("Filtrar por dominio"),
      category: z.string().optional().describe("Filtrar por categoría"),
      max_results: z.number().optional().describe("Máximo de resultados (default: 5)"),
    },
    async (input) => {
      const result = query(vaultPath, db, input);
      session.log("query", `"${input.question}"${input.domain ? ` en ${input.domain}` : ""}`);
      return { content: [{ type: "text", text: withStaleCheck(result) }] };
    },
  );

  // promote
  server.tool(
    "promote",
    "Convierte los aprendizajes de una sesión en páginas del vault. Úsalo al final de cada sesión",
    {
      session_summary: z.string().describe("Resumen de la sesión en una línea"),
      learnings: z.array(z.object({
        title: z.string(),
        content: z.string(),
        domain: z.string(),
        category: z.string(),
        page_type: z.string(),
        tags: z.array(z.string()).optional(),
        related_to: z.array(z.object({
          domain: z.string(),
          category: z.string(),
          page: z.string(),
          relation: z.string(),
        })).optional(),
      })).describe("Lista de aprendizajes a integrar"),
    },
    async (input) => {
      const result = promote(vaultPath, discovery, db, input);
      session.log("promote", `${input.learnings.length} aprendizajes — ${input.session_summary}`);
      for (const l of input.learnings) {
        session.trackPageCreated(`${l.domain}/${l.category}/${l.title}`);
      }
      return { content: [{ type: "text", text: withStaleCheck(result) }] };
    },
  );

  // link
  server.tool(
    "link",
    "Crea una relación tipada entre dos páginas existentes del vault",
    {
      from: z.object({
        domain: z.string(),
        category: z.string(),
        page: z.string(),
      }).describe("Página origen"),
      relation: z.enum(["related_to", "evolved_into", "depends_on", "supports", "contradicts", "supersedes"]),
      to: z.object({
        domain: z.string(),
        category: z.string(),
        page: z.string(),
      }).describe("Página destino"),
      note: z.string().optional().describe("Nota sobre la relación"),
    },
    async (input) => {
      const result = link(vaultPath, db, input);
      const fromId = `${input.from.domain}/${input.from.category}/${input.from.page}`;
      const toId = `${input.to.domain}/${input.to.category}/${input.to.page}`;
      session.log("link", `${fromId} —[${input.relation}]→ ${toId}`);
      return { content: [{ type: "text", text: withStaleCheck(result) }] };
    },
  );

  // lint
  server.tool(
    "lint",
    "Health-check del vault. Detecta huérfanos, links rotos, dominios vacíos y duplicados",
    {},
    async () => {
      const result = lint(vaultPath, discovery, db);
      session.log("lint", "health-check ejecutado");
      return { content: [{ type: "text", text: withStaleCheck(result) }] };
    },
  );

  // remember
  server.tool(
    "remember",
    "Guarda una memoria efímera en el brain. Compartida entre máquinas, vive hasta que la borres o expire. Ideal para contexto de trabajo en progreso.",
    {
      title: z.string().describe("Título descriptivo de la memoria"),
      content: z.string().describe("El contenido a recordar"),
      tags: z.array(z.string()).optional().describe("Tags para búsqueda"),
      expires: z.string().optional().describe("Fecha de expiración ISO (ej: 2026-04-22). Si no se especifica, vive hasta que la borres"),
    },
    async (input) => {
      const result = remember(vaultPath, db, input);
      session.log("remember", `"${input.title}"`);
      return { content: [{ type: "text", text: result }] };
    },
  );

  // forget
  server.tool(
    "forget",
    "Borra memorias efímeras del brain. Puedes borrar una específica por título o limpiar todas las expiradas.",
    {
      title: z.string().optional().describe("Título de la memoria a olvidar"),
      clear_expired: z.boolean().optional().describe("Limpiar todas las memorias expiradas"),
    },
    async (input) => {
      const result = forget(vaultPath, db, input);
      session.log("forget", input.title ?? "clear_expired");
      return { content: [{ type: "text", text: result }] };
    },
  );

  return server;
}
