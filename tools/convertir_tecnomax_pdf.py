"""
Convierte la lista de precios de Tecnomax (PDF) a un .xlsx plano que la app
puede importar con el asistente genérico ("Otro proveedor").

Por qué existe: Tecnomax manda su catálogo en PDF, no en Excel como GVS. El
PDF sí tiene una tabla real por dentro (con celdas delimitadas), así que
pdfplumber puede leerla con precisión — pero cada sección del documento usa un
layout de columnas ligeramente distinto (cámaras/DVR, accesorios con foto,
racks por dimensiones, etc.), así que en vez de asumir columnas fijas, este
script clasifica cada fila de forma genérica:
  - fila con una sola celda con texto -> etiqueta de marca/sección
  - fila con una celda con fecha -> etiqueta de categoría (y esa fecha es la
    "fecha del proveedor" del catálogo)
  - fila con "Código"/"Referencia" (o dos últimas celdas tipo "Precio"/
    "Precio IVA") -> encabezado de subcategoría
  - cualquier otra fila -> producto: primera celda no vacía = código, el
    resto (antes de las 2 últimas) = descripción, las 2 últimas = precios
    (o "AGOTADO"/"CONSULTAR ASESOR" en vez de precio)

Uso:
    python convertir_tecnomax_pdf.py "ruta/al/catalogo.pdf" "ruta/de/salida.xlsx"

Requiere: pip install pdfplumber openpyxl

Después de correrlo: importa el .xlsx resultante en la app con "Otro
proveedor" -> TECNOMAX. Si ya existe un perfil de mapeo guardado para
TECNOMAX, el asistente lo reutiliza solo. Si Tecnomax cambia el layout del
PDF de forma importante, puede que aparezcan más filas en "sin clasificar" —
revísalas en la salida de consola antes de dar por buena la importación.
"""
import sys
import re
import pdfplumber
import openpyxl

DATE_RE = re.compile(r'\d{1,2}/\d{1,2}/\d{4}')
MONEY_RE = re.compile(r'[\d.,]+')
HEADER_WORDS = {'codigo', 'código', 'referencia'}
HEADER_PRICE_WORDS = {'precio', 'precio iva', 'antes de iva', 'incluido iva', 'antes de i.v.a', 'incluido i.v.a'}
BOILERPLATE = {
    'codigo', 'código', 'referencia', 'imagen', 'descripcion', 'descripción',
    'antes de iva', 'antes de i.v.a', 'incluido iva', 'incluido i.v.a',
    'precio', 'precio iva', 'dimensiones (cm', 'dimensiones (cm)'
}
# raíces amplias a propósito: en este documento "agotado" y "consultar con el
# asesor" aparecen con varios errores de tipeo (ASESRO, CONSUTA, etc.)
NO_PRECIO_MARCAS = ('agotad', 'consu', 'ases')


def clean(c):
    if c is None:
        return ''
    return re.sub(r'\s+', ' ', str(c)).strip()


def es_no_disponible(c):
    return any(m in clean(c).lower() for m in NO_PRECIO_MARCAS)


def es_vacio_o_placeholder(c):
    # celdas tipo "", "$", "$ -", "-" cuentan como "sin dato", no rompen el patrón
    return clean(c).replace('$', '').replace('-', '').replace(' ', '') == ''


def es_incluido_iva_label(c):
    c = clean(c).lower()
    return 'incluido iva' in c or 'incuido iva' in c


def es_terminal_valida(c):
    if es_vacio_o_placeholder(c) or es_no_disponible(c) or es_incluido_iva_label(c):
        return True
    c = clean(c).replace(' ', '')
    return bool(MONEY_RE.search(c)) and any(ch.isdigit() for ch in c)


def parsear_precio(c):
    c = clean(c).replace(' ', '')
    if es_vacio_o_placeholder(c) or es_no_disponible(c) or es_incluido_iva_label(c):
        return None
    m = MONEY_RE.search(c)
    if not m:
        return None
    n = m.group(0).replace('.', '').replace(',', '.')
    try:
        return float(n)
    except ValueError:
        return None


def estado_de(c):
    c = clean(c).lower()
    if 'agotad' in c:
        return 'AGOTADO'
    if 'consu' in c or 'ases' in c:
        return 'CONSULTAR ASESOR'
    return ''


def convertir(path_pdf, path_out):
    filas_final = []
    categoria_actual = ''
    marca_actual = ''
    subcategoria_actual = ''
    sin_clasificar = []

    with pdfplumber.open(path_pdf) as pdf:
        for pnum, page in enumerate(pdf.pages, start=1):
            for tabla in page.extract_tables():
                for row in tabla:
                    cells = [clean(c) for c in row]
                    non_empty = [c for c in cells if c]
                    if not non_empty:
                        continue

                    ultimos2 = non_empty[-2:] if len(non_empty) >= 2 else non_empty
                    es_header = (
                        any(c.lower() in HEADER_WORDS for c in non_empty) or
                        all(c.lower() in HEADER_PRICE_WORDS for c in ultimos2)
                    )
                    if es_header:
                        extra = [c for c in non_empty if c.lower() not in BOILERPLATE and not DATE_RE.search(c)]
                        if extra:
                            subcategoria_actual = extra[0]
                        continue

                    tiene_fecha = any(DATE_RE.search(c) for c in non_empty)
                    resto_sin_fecha = [c for c in non_empty if not DATE_RE.search(c)]
                    if tiene_fecha:
                        categoria_actual = resto_sin_fecha[0] if resto_sin_fecha else categoria_actual
                        continue
                    if len(non_empty) == 1:
                        marca_actual = non_empty[0]
                        continue

                    if not (len(cells) >= 2 and es_terminal_valida(cells[-1]) and es_terminal_valida(cells[-2])):
                        sin_clasificar.append((pnum, row))
                        continue

                    cuerpo = [c for i, c in enumerate(cells) if c and i < len(cells) - 2]
                    if not cuerpo:
                        sin_clasificar.append((pnum, row))
                        continue
                    codigo = cuerpo[0]
                    descripcion = ' '.join(cuerpo[1:]) if len(cuerpo) > 1 else ''

                    # caso especial: un solo precio ya incluye IVA y la ultima celda solo trae la etiqueta
                    if es_incluido_iva_label(cells[-1]) and not es_incluido_iva_label(cells[-2]):
                        precio_con_iva = parsear_precio(cells[-2])
                        precio_sin_iva = None
                        estado = ''
                    else:
                        precio_sin_iva = parsear_precio(cells[-2])
                        precio_con_iva = parsear_precio(cells[-1])
                        estado = estado_de(cells[-2]) or estado_de(cells[-1])

                    if precio_sin_iva is None and precio_con_iva is None and not estado:
                        estado = 'CONSULTAR ASESOR'

                    filas_final.append({
                        'Marca': marca_actual,
                        'Categoria': categoria_actual,
                        'Subcategoria': subcategoria_actual,
                        'Codigo': codigo,
                        'Descripcion': descripcion,
                        'PrecioSinIVA': precio_sin_iva,
                        'PrecioConIVA': precio_con_iva,
                        'Estado': estado
                    })

    print('total productos:', len(filas_final))
    print('filas sin poder clasificar (revisar a mano):', len(sin_clasificar))
    for pnum, row in sin_clasificar:
        print(' p', pnum, row)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Tecnomax'
    headers = ['Marca', 'Categoria', 'Subcategoria', 'Codigo', 'Descripcion', 'PrecioSinIVA', 'PrecioConIVA', 'Estado']
    ws.append(headers)
    for f in filas_final:
        ws.append([f[h] for h in headers])
    wb.save(path_out)
    print('guardado en', path_out)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print('Uso: python convertir_tecnomax_pdf.py <entrada.pdf> <salida.xlsx>')
        sys.exit(1)
    convertir(sys.argv[1], sys.argv[2])
