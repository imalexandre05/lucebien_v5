#!/bin/sh
# Hook de cierre — SCI-LB
#
# Regla del proyecto: ninguna tarea está terminada hasta que lo aprendido esté escrito.
# El grafo de código se actualiza solo; la semántica no.
#
# Este hook corre al terminar cada turno. Si hay código modificado sin ningún documento
# actualizado, avisa. No bloquea: sólo muestra el recordatorio.
#
# Salida: JSON en stdout con el campo systemMessage. Silencio (sin salida) si no hay nada que decir.

cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
command -v git >/dev/null 2>&1 || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

cambios=$(git status --porcelain 2>/dev/null | grep -v 'node_modules' | grep -v 'graphify-out')
[ -z "$cambios" ] && exit 0

# ¿Se tocó código?
codigo=$(printf '%s\n' "$cambios" | grep -cE '\.(ts|tsx|js|jsx|sql|mjs)$')
[ "$codigo" -eq 0 ] && exit 0

# ¿Se actualizó algún documento?
docs=$(printf '%s\n' "$cambios" | grep -cE '(^.{3}docs/|CLAUDE\.md$)')
[ "$docs" -gt 0 ] && exit 0

# ¿Cayó algo en zona crítica? (rigor nivel 3 — ver docs/rigor-por-zona.md)
critico=$(printf '%s\n' "$cambios" | grep -cE 'packages/(core|db)/|lib/(auth|reauth|permisos-repo|pipeline-repo|evaluaciones-repo|reportes-repo|desempeno-repo|pagos-repo)\.ts|lib/supabase/admin\.ts|middleware\.ts')

if [ "$critico" -gt 0 ]; then
  aviso="ZONA CRITICA tocada ($codigo archivos de codigo, ningun documento actualizado). Antes de cerrar: anota en docs/pendientes-negocio.md cualquier default que hayas inventado, actualiza docs/mapa-verificado.md si cambio el estado del sistema, y corre el subagente verificador antes de mergear."
else
  aviso="$codigo archivos de codigo modificados y ningun documento actualizado. Si aprendiste algo que la proxima sesion necesita saber, escribilo ahora — el grafo se actualiza solo, la semantica no."
fi

printf '{"systemMessage": "%s"}\n' "$aviso"
exit 0
