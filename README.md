# brain-mcp

Servidor MCP (Model Context Protocol) que actúa como cerebro compartido entre IAs. Almacena conocimiento estructurado en un vault de archivos Markdown, lo indexa en SQLite con búsqueda híbrida (full-text + semántica), y lo expone como herramientas consumibles por cualquier cliente MCP (Claude, Cursor, Warp, etc.).

## Características

- **Vault en Markdown**: todo el conocimiento vive como archivos `.md` con frontmatter YAML, legibles y editables por humanos.
- **Búsqueda híbrida**: combina FTS5 (SQLite full-text search, peso 40%) con búsqueda semántica por embeddings (peso 60%) para resultados más relevantes.
- **Embeddings locales**: usa `Xenova/all-MiniLM-L6-v2` via `@xenova/transformers`. Sin dependencias de APIs externas. El modelo se descarga una vez y se cachea en `~/.cache/huggingface`.
- **Grafo de conocimiento**: relaciones tipadas entre páginas (`related_to`, `evolved_into`, `depends_on`, `supports`, `contradicts`, `supersedes`).
- **Memorias efímeras**: notas de corta duración con fecha de expiración opcional, compartidas entre sesiones.
- **Watcher en tiempo real**: detecta cambios en el vault y mantiene el índice actualizado automáticamente.
- **Log de operaciones**: cada acción queda registrada en `vault/log.md`.

## Arquitectura

```
vault/                     ← Archivos Markdown (el "cerebro")
  _brain.md                ← Configuración global del vault
  index.md                 ← Índice de dominios
  log.md                   ← Log de operaciones
  _ephemeral/              ← Memorias efímeras
  <dominio>/
    _schema.md             ← Metadata del dominio
    <categoría>/
      <página>.md          ← Unidad de conocimiento

data/
  brain.db                 ← SQLite: índice FTS5, embeddings, edges, dominios

src/
  index.ts                 ← Entry point: init DB, reindex, watcher, servidor MCP
  db/schema.ts             ← Schema SQLite (pages, pages_fts, edges, domains, embeddings)
  server/mcp.ts            ← Definición de herramientas MCP
  search/
    fts.ts                 ← FTS5 + búsqueda híbrida (indexPage, searchPages)
    embeddings.ts          ← Generación y almacenamiento de embeddings
  vault/
    discovery.ts           ← Lectura de estructura de dominios
    reader.ts              ← Parse de archivos .md con frontmatter
    writer.ts              ← Escritura de páginas y frontmatter
    watcher.ts             ← Watcher de cambios en el vault (chokidar)
    linker.ts              ← Gestión de edges entre páginas
  tools/                   ← Implementación de cada herramienta MCP
  wiki/
    index-manager.ts       ← Gestión del archivo index.md
    log-manager.ts         ← Log de operaciones
    linter.ts              ← Health-check del vault
    session-manager.ts     ← Log de sesión en memoria
  ephemeral/
    stale-check.ts         ← Detección de memorias efímeras vencidas
```

## Herramientas MCP

| Herramienta | Descripción |
|---|---|
| `list_domains` | Lista dominios con estadísticas de páginas |
| `create_domain` | Crea un dominio con estructura de carpetas |
| `ingest` | Agrega una página de conocimiento al vault |
| `query` | Búsqueda híbrida (FTS + semántica) |
| `promote` | Convierte aprendizajes de sesión en páginas del vault |
| `link` | Crea una relación tipada entre dos páginas |
| `lint` | Health-check: huérfanos, links rotos, duplicados |
| `remember` | Guarda una memoria efímera (opcionalmente con fecha de expiración) |
| `forget` | Borra memorias efímeras por título o limpia las expiradas |

### Relaciones entre páginas

Al usar `ingest`, `promote` o `link`, puedes especificar relaciones:

- `related_to` — páginas relacionadas en general
- `evolved_into` — esta página derivó en otra
- `depends_on` — requiere otra página para tener sentido
- `supports` — refuerza el contenido de otra página
- `contradicts` — entra en conflicto con otra
- `supersedes` — reemplaza a otra página anterior

## Búsqueda híbrida

`query` combina dos métodos:

1. **FTS5** (SQLite full-text search) — rápido, exacto por palabras clave. Peso: **40%**.
2. **Semántica** (cosine similarity sobre embeddings `all-MiniLM-L6-v2` 384d) — entiende sinónimos y contexto. Peso: **60%**.

Si el modelo de embeddings no está disponible al iniciar, el sistema cae automáticamente a FTS-only sin errores.

## Instalación

```bash
# Clonar el repo
git clone https://github.com/Tonyaki98/brain-mcp.git
cd brain-mcp

# Instalar dependencias
npm install

# Compilar TypeScript
npm run build
```

El modelo de embeddings se descarga automáticamente en el primer uso (~25 MB, cuantizado).

## Uso

### Modo desarrollo

```bash
npm run dev
```

Usa `tsx watch` para recompilación automática en cambios.

### Modo producción

```bash
npm run build
npm start
```

### Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `VAULT_PATH` | `./vault` | Ruta al directorio del vault |
| `DB_PATH` | `./data/brain.db` | Ruta al archivo SQLite |

### Configurar en Claude Desktop

Agrega esto a tu `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "brain": {
      "command": "node",
      "args": ["/ruta/a/brain-mcp/dist/index.js"],
      "env": {
        "VAULT_PATH": "/ruta/a/tu/vault",
        "DB_PATH": "/ruta/a/tu/data/brain.db"
      }
    }
  }
}
```

### Configurar en Warp (Oz)

Agrega el servidor MCP desde la configuración de Warp apuntando al binario compilado o a `npm run dev` para modo desarrollo.

## Flujo de trabajo recomendado

1. **Al inicio de sesión**: usa `query` para recuperar contexto relevante de sesiones anteriores.
2. **Durante la sesión**: usa `remember` para guardar notas de trabajo en progreso.
3. **Al final de sesión**: usa `promote` para convertir los aprendizajes en páginas permanentes del vault.
4. **Periódicamente**: usa `lint` para detectar inconsistencias y `forget` con `clear_expired: true` para limpiar memorias vencidas.

## Base de datos SQLite

El schema incluye cuatro tablas principales:

- **`pages`**: todas las páginas indexadas con metadata y contenido.
- **`pages_fts`**: tabla virtual FTS5 sincronizada con `pages` via triggers.
- **`embeddings`**: vectores Float32 (384 dimensiones) en BLOB, referenciados por `page_id`.
- **`edges`**: relaciones tipadas entre páginas.
- **`domains`**: metadata de cada dominio registrado.

## Stack

- **Runtime**: Node.js (ESM)
- **Lenguaje**: TypeScript 5
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Base de datos**: `better-sqlite3` (SQLite con FTS5)
- **Embeddings**: `@xenova/transformers` (modelo `all-MiniLM-L6-v2`, cuantizado)
- **Watcher**: `chokidar`
- **Frontmatter**: `gray-matter`
- **Validación**: `zod`
