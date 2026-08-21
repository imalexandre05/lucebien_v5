"""Comprueba que cada clase de token usada en el codigo EXISTA en el CSS compilado.

Tailwind no falla ante una clase inventada: la descarta en silencio. Despues de barrer 517 clases
a mano, esa es la forma en que un estado deja de pintarse sin que tsc, el build ni el guard digan
nada.
"""
import io, os, re, glob

os.chdir('apps/erp-web')

FAMILIAS = r'(?:exito|aviso|error|info|cat-lila|cat-arcilla|cat-mar|gold|navy|paper|ink|line|muted)'
# Utilidad completa: prefijo-familia[-paso][/opacidad]
UTIL = re.compile(
    r'(?<![\w-])((?:[a-z-]+:)*)((?:bg|text|border|ring|divide|from|via|to|fill|stroke|shadow|accent|caret|outline|decoration|placeholder)-'
    + FAMILIAS + r'(?:-(?:soft|line|deep|dark))?)(?:/\d+)?(?![\w-])'
)

usos = {}
for base, _, archivos in os.walk('.'):
    if 'node_modules' in base or '.next' in base:
        continue
    for a in archivos:
        if not a.endswith(('.tsx', '.ts')):
            continue
        ruta = os.path.join(base, a)
        for m in UTIL.finditer(io.open(ruta, encoding='utf-8').read()):
            variantes, util = m.group(1), m.group(2)
            usos.setdefault(util, set()).add(ruta)
            if variantes:
                usos.setdefault(variantes + util, set()).add(ruta)

css_files = sorted(glob.glob('.next-build/static/css/*.css'), key=os.path.getmtime)
css = '\n'.join(io.open(f, encoding='utf-8').read() for f in css_files)

def escapado(clase):
    # Selector tal como Tailwind lo escribe: los dos puntos y el punto van escapados.
    return clase.replace(':', r'\:').replace('.', r'\.').replace('/', r'\/')

faltan = []
for clase in sorted(usos):
    esc = escapado(clase)
    # Presente como clase suelta (.bg-exito-soft) o como final de una con variante
    # (.hover\:bg-gold-soft). Sin la segunda comprobacion, toda utilidad que solo se use con
    # variante se reporta como faltante: cinco falsos positivos en la primera version, y una
    # herramienta que grita en falso se deja de leer.
    barra = chr(92)
    if ('.' + esc) in css or (barra + ':' + esc) in css:
        continue
    faltan.append(clase)

print('CSS revisado: %s' % ', '.join(os.path.basename(f) for f in css_files))
print('utilidades distintas encontradas en el codigo: %d' % len(usos))
if not faltan:
    print('TODAS existen en el CSS compilado.')
else:
    print('NO EXISTEN en el CSS (%d):' % len(faltan))
    for c in faltan:
        archivos = sorted(usos[c])
        print('  %-42s  %s%s' % (c, archivos[0], ' (+%d)' % (len(archivos) - 1) if len(archivos) > 1 else ''))
