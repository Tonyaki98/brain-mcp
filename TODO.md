# Brain MCP — Roadmap

## Completado

- [x] MCP server con 7 tools base: `list_domains`, `create_domain`, `ingest`, `query`, `promote`, `link`, `lint`
- [x] Memorias efímeras: `remember` y `forget` tools
  - Guardadas en `vault/_ephemeral/` con frontmatter `type: ephemeral`
  - `expires` opcional (ISO date), sin expiración por default
  - Stale check automático (+30 días) en cada llamada a cualquier tool
  - Indexadas en SQLite para que `query` las encuentre
- [x] Docker build funcional con volúmenes para vault y data
- [x] `.dockerignore` para builds limpios
- [x] Repo público en GitHub

## Pendiente

### Transporte HTTP para deploy remoto (Coolify)
- [ ] Modo dual de transporte: stdio (local) vs HTTP (remoto) controlado por env var `TRANSPORT=http`
- [ ] Usar `StreamableHTTPServerTransport` del SDK (ya disponible en `@modelcontextprotocol/sdk`)
- [ ] Exponer en un puerto configurable (`PORT=3100`)
- [ ] Arranque: `TRANSPORT=http PORT=3100 node dist/index.js` para Docker/Coolify

### Obsidian en remoto
- [ ] Evaluar **Obsidian Git plugin** para sync del vault como repo (push/pull automático)
- [ ] Alternativa: endpoint REST `/vault` que sirva archivos markdown para lectura
- [ ] El vault en Docker es el source of truth; Obsidian sincroniza contra él

### Docker Compose
- [ ] Instalar plugin `docker compose` v2 o actualizar `docker-compose.yml` para compatibilidad
- [ ] Agregar healthcheck al Dockerfile
- [ ] Configurar restart policy y logging

### Mejoras futuras
- [ ] Autenticación para el endpoint HTTP (API key o similar)
- [ ] Backup automático del vault/DB
- [ ] Dashboard web para visualizar el grafo de conocimiento
