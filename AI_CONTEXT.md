# AI Assistant Context — Tony

Este archivo es la fuente de verdad para cualquier asistente de IA que trabaje conmigo.
Copiar al archivo de configuracion correspondiente de cada herramienta (CLAUDE.md, .opencode, AGENTS.md, etc).

---

# Sobre mi

- Me llamo Tony, soy desarrollador fullstack, en esta maquina principalmente Android
- Prefiero comunicarme en espanol
- Todo el codigo, variables, commits, PRs y documentacion tecnica en ingles

# Estilo de respuesta

- Directo al codigo si es algo simple
- Detallado con explicacion si es algo complejo
- No explicar cosas que no pregunte
- Despues de cada cambio de codigo, sugerir si vale la pena correr tests (no siempre aplica, usar criterio)

# Commits

- Los commits los manejo yo desde el IDE, no generarlos automaticamente

# Diagramas

- Cuando se necesite un diagrama (arquitectura, flujos, pipelines, relaciones), usar **Mermaid** dentro de bloques ```mermaid en markdown
- Mermaid es texto puro: se renderiza en Obsidian/GitHub, es indexable y cualquier IA lo puede generar y leer

# Memoria y conocimiento — Brain MCP

Tengo un servidor MCP llamado **brain-mcp** que funciona como cerebro compartido entre todas las IAs. Es un vault de Obsidian con busqueda hibrida (FTS5 + embeddings semanticos).

## Tools disponibles
- **query** — Buscar conocimiento existente (siempre buscar antes de responder preguntas de arquitectura, decisiones o patrones)
- **ingest** — Persistir conocimiento nuevo permanente (patrones, decisiones, mecanismos)
- **remember** — Guardar contexto efimero (status de PRs, progreso de tareas, estado de deploys)
- **forget** — Borrar memorias efimeras
- **list_domains** — Ver dominios disponibles
- **create_domain** — Crear dominio nuevo si ninguno encaja
- **link** — Crear relacion entre dos paginas
- **lint** — Health-check del vault
- **promote** — Convertir aprendizajes de sesion en paginas del vault

## Reglas de uso
1. **ANTES de responder** preguntas sobre arquitectura, decisiones pasadas, patrones del proyecto o contexto de trabajo: buscar en el brain primero. Es la primera fuente de verdad.
2. Si el brain no tiene la respuesta, buscar en el codigo/git y luego **persistir** lo encontrado para la proxima vez.
3. Antes de ingestar, verificar que no exista ya.
4. Si ningun dominio encaja, crear uno nuevo.

## Que ingestar
- Bug no trivial resuelto → `gotcha` o `mechanism`
- Descubrimiento de arquitectura → `mechanism` o `definition`
- Decision tecnica con tradeoffs → `decision` o `tradeoff`
- Patron reutilizable → `pattern` o `recipe`
- Workaround o quirk de herramienta → `gotcha`
- Proceso aprendido (CI/CD, PR flow, deploys) → `pattern`

## Que NO ingestar
- Conversaciones triviales
- Cambios menores de codigo
- Cosas que se derivan directamente del codigo

## Efimero vs permanente
- Corta vida (status de PRs, progreso, estado de deploy) → **remember** (efimero)
- Conocimiento duradero (patrones, decisiones, mecanismos) → **ingest** (permanente)

# Stack principal

- **Android:** Kotlin, Jetpack Compose, Clean Architecture, Dagger, Coroutines/Flow
- **Testing:** MockK, Turbine, Paparazzi
- **CI/CD:** Bitrise, JFrog Artifactory
- **VCS:** Git, GitHub (org: Bancar)
- **Design System:** Abra (AbraTheme, AbraDimens, AbraTypography)
- **Arquitectura:** Route/Screen/Actions, Coordinator pattern, UseCases con Flow<Response<T>>
