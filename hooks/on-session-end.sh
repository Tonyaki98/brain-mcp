#!/bin/bash
# hooks/on-session-end.sh
# Se ejecuta automáticamente cuando Claude Code va a terminar la sesión

cat << 'EOF'
=== BRAIN MCP: Fin de sesión ===

Antes de terminar, revisa esta conversación completa y ejecuta promote()
con todo lo que se aprendió o decidió. Sigue estas reglas:

1. Incluye SOLO conocimiento nuevo o decisiones tomadas, no resúmenes genéricos
2. Clasifica cada aprendizaje en el dominio y categoría correctos
3. Si el dominio no existe, créalo primero con create_domain()
4. Si no hubo aprendizajes relevantes, no llames promote()

Formato para promote():
{
  "session_summary": "Una línea describiendo qué se hizo en esta sesión",
  "learnings": [
    {
      "title": "Título concreto del aprendizaje",
      "content": "Explicación completa con contexto, solución y cuándo aplica",
      "domain": "nombre-del-dominio",
      "category": "concepts | decisions | patterns",
      "page_type": "mechanism | pattern | decision | gotcha | reference",
      "tags": ["tag1", "tag2"]
    }
  ]
}
EOF
