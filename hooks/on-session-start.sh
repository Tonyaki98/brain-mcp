#!/bin/bash
# hooks/on-session-start.sh
# Uso: llamado por Claude Code al inicio de sesión via instrucción en CLAUDE.md

echo "=== BRAIN MCP: Cargando contexto ==="
echo "Llama al tool list_domains() para ver qué dominios están disponibles."
echo "Si el usuario menciona un tema específico, llama query() antes de responder."
