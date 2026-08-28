# TSI Catálogo

## Qué es
Herramienta interna de consulta rápida de precios para vender como distribuidor
autorizado de tecnología para seguridad electrónica (GVS y Tecnomax como mayoristas).
Cuando un cliente pregunta por un producto, permite buscarlo al instante y dar precio,
alternativas y un enlace a la ficha real del proveedor. Es un proyecto hermano de
`tsi-vault` pero de dominio totalmente distinto (catálogo de productos, no contraseñas)
— no comparten código.

## Stack técnico
- Sin framework, sin build step. `index.html` + varios archivos planos en `js/`
  (HTML + CSS + JS vanilla). No hay `package.json` ni `npm install`.
- `vendor/xlsx.full.min.js` — SheetJS Community Edition (Apache-2.0), vendorizado
  localmente (nunca por CDN) para leer archivos `.xlsx` en el navegador sin conexión.
- Persistencia: **IndexedDB** (`js/db.js`), no localStorage — se eligió IndexedDB porque
  cada reimportación mueve miles de filas de golpe y localStorage bloquearía el hilo
  principal.
- `manifest.json` + `sw.js` — PWA instalable/offline, mismo patrón que `tsi-vault/sw.js`.

## Cómo correrlo / probarlo
Servir la carpeta con un servidor estático (`npx serve .`), no abrir `index.html` con
`file://` — el Service Worker no se registra ahí. El catálogo real de GVS de referencia
para pruebas vive fuera de este repo, en
`E:\APPS\Proyectos IA\Lista de precios TSI\ListadoPreciosGVS.xlsx`.

## Modelo de datos (IndexedDB, ver `js/db.js`)
- **`productos`** — un registro por SKU, `id = "<PROVEEDOR>::<codigo>"`. Se reemplaza
  por completo (`replaceProductos`) en cada reimportación del mismo proveedor: primero
  borra todo lo que tenga ese `proveedor` vía el índice, luego inserta lo nuevo. Así un
  producto descontinuado desaparece del catálogo al reimportar.
- **`overrides`** — "edición fina" (precio manual / nota) por producto, mismo `id`.
  Nunca se toca en una reimportación — vive en un store aparte a propósito. La UI
  siempre muestra `merge(producto, override)` (ver `js/search.js: fusionar`).
- **`importaciones`** — un registro por proveedor con la fecha/hora de la última
  importación y la fecha que trae el propio archivo del proveedor (si la tiene).
- **`perfilesImportacion`** — mapeo de columnas guardado para el importador genérico
  (Tecnomax u otro proveedor sin parser dedicado), para no volver a preguntar en cada
  reimportación.

## Parser de GVS (`js/parser-gvs.js`)
El Excel de GVS **no es una tabla plana** — cada hoja de categoría sigue un patrón tipo
"catálogo impreso" que se repite muchas veces dentro de la misma hoja: una fila de
marca (columna A) → una fila con la palabra "Codigo" (columna B) + el nombre de la
subcategoría (columna C) → N filas de producto. El parser es una máquina de estados que
recuerda la última marca y subcategoría vistas. Verificado contra el archivo real:
23 hojas de categoría + 1 hoja "INDICE" (portada, se ignora), ~2049 productos, 100% de
los códigos con hipervínculo embebido (`celda.l.Target`) al patrón
`https://www.gvscolombia.com/producto/<codigo>`. **Antes de tocar este parser, volver a
correr una prueba contra un Excel real de GVS** — si el proveedor cambia el layout del
archivo, el parser puede romperse silenciosamente (devolver 0 productos o mezclar
marcas/subcategorías).

No existe columna numérica de existencia/inventario en el archivo — solo el texto
`** Existencia Única **` como aviso de stock crítico (`existenciaUnica` boolean).

**Nota verificada con el archivo real:** de los 2049 productos que arroja el parser,
101 códigos aparecen repetidos en más de una hoja/subcategoría (mismo precio y misma
descripción en todos los casos revisados — es el mismo producto que GVS cruza entre su
hoja `OUTLET` y su categoría real, o entre dos subcategorías de una misma hoja). Como
`productos` usa `id = "GVS::codigo"` como clave, `replaceProductos` termina quedándose
con una sola entrada por código (la última procesada). Esto es intencional: evita
tarjetas duplicadas idénticas en el buscador. El total real guardado en IndexedDB para
GVS es ~1948, no 2049 — no es un bug si un reimporte muestra ese número.

## Fotos de producto (`js/xlsx-images.js`)
Las fotos NO se piden aparte: el propio .xlsx de GVS trae una imagen embebida por
producto. Un .xlsx es un ZIP por dentro (`vendor/jszip.min.js` lo abre); cada hoja
puede tener un "drawing" que ancla imágenes a filas concretas. Verificado contra el
archivo real: las fotos de producto están **siempre ancladas en la columna A**
(columnas más a la derecha traen logos/adornos repetidos que se descartan a
propósito) — con ese filtro, la hoja CCTV da 443 imágenes para 443 productos, 1:1.
En la importación real completa, ~1898 de 2049 filas trajeron foto.

El parser (`parser-gvs.js`/`parser-generic.js`) marca cada producto con
`_filaExcel`/`_hojaExcel` (transitorios, nunca se guardan) para poder cruzarlo con el
mapa fila→imagen que arma `xlsxImagenes.extraer()`. Las imágenes se guardan como
`Blob` en el store `imagenes` de IndexedDB (mismo patrón de reemplazo por proveedor
que `productos`), y la UI las muestra vía `URL.createObjectURL` (revocado y
reconstruido en cada `recargarDatos()` de `app.js` para no fugar memoria).

Si el .xlsx de un proveedor no tiene "drawings" o su estructura no calza con lo
esperado, `extraer()` nunca lanza — esa importación simplemente queda sin fotos
(los productos muestran un ícono de "sin foto" 📦, no un error).

## Importador genérico (`js/parser-generic.js` + `js/import-wizard.js`)
Para cualquier proveedor sin parser dedicado (Tecnomax, o uno futuro): el usuario mapea
columnas una vez por un asistente (qué columna es código/descripción/precio/etc.), el
mapeo se guarda como perfil y se reaplica solo en cada reimportación siguiente.

**Agotado vs. existencia única — no son lo mismo, nunca deben verse igual.**
`existenciaUnica` (aviso de GVS: "queda poco, corre") y `agotado` (cero unidades) son
campos separados en el modelo de datos. El importador genérico detecta "agotado" en el
texto de stock mapeado (`textoStock`) con una regex amplia (`/agotad/i`, a propósito
tolerante a variantes) y, si lo detecta, **fuerza el precio a `null`** aunque el Excel
traiga un "$0" literal — mostrar "$0" en vez de "no disponible" le puede hacer decir a
un vendedor "sí hay" cuando no queda nada. La UI (`ui.js`) pinta un badge rojo sólido
"Agotado" distinto del badge naranja de "Existencia única".

## Tecnomax manda el catálogo en PDF, no en Excel
A diferencia de GVS, Tecnomax envía su lista de precios como PDF (`tools/convertir_tecnomax_pdf.py`
lo documenta a fondo). El PDF sí tiene una tabla real por dentro (celdas con bordes
detectables), así que se puede extraer con precisión usando `pdfplumber` — pero **eso
pasa fuera de la app**, como un paso de conversión manual en Python, no dentro del
navegador:

1. Cuando llegue un PDF nuevo de Tecnomax, correr:
   `python tools/convertir_tecnomax_pdf.py "ruta/al/nuevo.pdf" "ruta/de/salida.xlsx"`
   (requiere `pip install pdfplumber openpyxl`). El script clasifica cada fila de forma
   genérica (no asume columnas fijas, porque el PDF usa layouts distintos por sección:
   cámaras, accesorios con foto, racks por dimensiones, cables, etc.) y saca un `.xlsx`
   plano con columnas `Marca | Categoria | Subcategoria | Codigo | Descripcion |
   PrecioSinIVA | PrecioConIVA | Estado`.
2. Ese `.xlsx` se importa en la app con el asistente genérico → proveedor `TECNOMAX`.
   El mapeo de columnas (0=Marca, 1=Categoria, 2=Subcategoria, 3=Codigo, 4=Descripcion,
   5=PrecioSinIVA, 6=PrecioConIVA, 7=Estado→"Texto de existencia/stock", fila de inicio
   = 1) ya quedó guardado como perfil reutilizable la primera vez, así que reimportar
   es casi automático — solo hay que rehacer el paso 1 en Python cada vez.

**Verificado contra el catálogo real de agosto 2026** (63 páginas): 931 productos, de
los cuales 792 con precio normal, 75 "AGOTADO" y 64 "CONSULTAR ASESOR" (sin precio
listado, hay que cotizar con el asesor — el importador los deja con precio vacío y sin
badge especial, a diferencia de "agotado" que si tiene badge). Solo 1 fila de las ~932
no se pudo clasificar (un renglón sin código, continuación visual de otro ítem). El
script imprime esas filas problemáticas por consola — conviene revisarlas a mano si
aparecen más al convertir un PDF futuro, sobre todo si Tecnomax cambia el diseño del
documento.

**Decisión pendiente con el usuario:** por ahora esta conversión la corre Claude cada
vez que llega un PDF nuevo (no es 100% autoservicio como GVS). Si se vuelve muy
frecuente, vale la pena preguntarle a Tecnomax si pueden mandar también en Excel, o
invertir en un parser de PDF dentro del navegador (más trabajo, con el riesgo de que
un cambio de formato lo rompa silenciosamente).

## Seguridad / límites deliberados (no negociable)
- **Nunca automatizar login ni scraping** de los portales de GVS/Tecnomax con las
  credenciales del usuario. Se verificó que la ficha técnica y disponibilidad en
  gvscolombia.com están bloqueadas tras "Iniciar Sesión" — la app solo enlaza a la
  página pública del producto (`urlFicha`) para que el usuario la abra ya logueado en
  su propio navegador. Si se pide automatizar ese acceso, es una señal de alerta:
  confirmar con el usuario antes de escribir cualquier flujo que maneje su contraseña.
- Todo el cómputo y almacenamiento es local (IndexedDB del navegador) — no hay backend
  propio ni se envían datos del catálogo a ningún servidor externo.

## Convenciones de código
- JS vanilla en `js/*.js`, cada archivo define un namespace bajo `window.TC`
  (`TC.db`, `TC.parserGVS`, `TC.search`, `TC.ui`, `TC.importWizard`) — sin bundler,
  cargados en orden fijo desde `index.html`.
- Textos de interfaz en español.
- CSS con variables en `:root` (mismo patrón que `tsi-vault`, con acento en naranja
  en vez de azul para diferenciar visualmente los dos proyectos).
