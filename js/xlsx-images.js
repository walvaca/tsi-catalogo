/* Extrae las fotos de producto embebidas dentro del propio .xlsx. Un Excel es
   un ZIP por dentro: cada hoja puede tener un "drawing" (xl/drawings/drawingN.xml)
   con una imagen anclada a una fila/columna concreta, y esa imagen vive como
   archivo binario en xl/media/imageN.png|jpg. Verificado contra el catálogo real
   de GVS: las fotos de producto están siempre ancladas en la columna A (índice 0)
   de la fila del producto — otras columnas traen logos/adornos repetidos que se
   descartan a propósito. Si el archivo no trae "drawings" (o su estructura no es
   la esperada), esto no debe romper el import: solo significa "sin fotos". */
var TC = window.TC || (window.TC = {});

TC.xlsxImagenes = (function () {
  const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  function resolverRuta(dirBase, rel) {
    if (rel.startsWith('/')) return rel.replace(/^\/+/, '');
    const partes = dirBase.split('/').filter(Boolean);
    for (const p of rel.split('/')) {
      if (p === '..') partes.pop();
      else if (p !== '.' && p !== '') partes.push(p);
    }
    return partes.join('/');
  }

  function dirDe(ruta) {
    const i = ruta.lastIndexOf('/');
    return i === -1 ? '' : ruta.slice(0, i);
  }

  function rutaRels(ruta) {
    const i = ruta.lastIndexOf('/');
    const dir = i === -1 ? '' : ruta.slice(0, i);
    const archivo = i === -1 ? ruta : ruta.slice(i + 1);
    return (dir ? dir + '/' : '') + '_rels/' + archivo + '.rels';
  }

  function attr(el, nombre) {
    return el.getAttribute(nombre) || el.getAttributeNS(NS_REL, nombre.split(':').pop());
  }

  async function leerXml(zip, ruta, parser) {
    const archivo = zip.file(ruta);
    if (!archivo) return null;
    const texto = await archivo.async('string');
    return parser.parseFromString(texto, 'application/xml');
  }

  async function mapaHojaARuta(zip, parser) {
    const wbDoc = await leerXml(zip, 'xl/workbook.xml', parser);
    const relsDoc = await leerXml(zip, 'xl/_rels/workbook.xml.rels', parser);
    if (!wbDoc || !relsDoc) return {};

    const relIdARuta = {};
    Array.from(relsDoc.getElementsByTagName('Relationship')).forEach(r => {
      relIdARuta[r.getAttribute('Id')] = resolverRuta('xl', r.getAttribute('Target'));
    });

    const mapa = {};
    Array.from(wbDoc.getElementsByTagName('sheet')).forEach(s => {
      const nombre = s.getAttribute('name');
      const rId = attr(s, 'r:id');
      if (nombre && rId && relIdARuta[rId]) mapa[nombre] = relIdARuta[rId];
    });
    return mapa;
  }

  async function imagenesDeHoja(zip, parser, rutaHoja) {
    const relsHoja = await leerXml(zip, rutaRels(rutaHoja), parser);
    if (!relsHoja) return new Map();

    let rutaDrawing = null;
    Array.from(relsHoja.getElementsByTagName('Relationship')).forEach(r => {
      if ((r.getAttribute('Type') || '').endsWith('/drawing')) {
        rutaDrawing = resolverRuta(dirDe(rutaHoja), r.getAttribute('Target'));
      }
    });
    if (!rutaDrawing) return new Map();

    const drawingDoc = await leerXml(zip, rutaDrawing, parser);
    if (!drawingDoc) return new Map();

    const relsDrawing = await leerXml(zip, rutaRels(rutaDrawing), parser);
    const embedARuta = {};
    if (relsDrawing) {
      Array.from(relsDrawing.getElementsByTagName('Relationship')).forEach(r => {
        embedARuta[r.getAttribute('Id')] = resolverRuta(dirDe(rutaDrawing), r.getAttribute('Target'));
      });
    }

    const anchors = [
      ...Array.from(drawingDoc.getElementsByTagNameNS('*', 'oneCellAnchor')),
      ...Array.from(drawingDoc.getElementsByTagNameNS('*', 'twoCellAnchor'))
    ];

    const filaARuta = new Map();
    for (const anchor of anchors) {
      const from = anchor.getElementsByTagNameNS('*', 'from')[0];
      if (!from) continue;
      const colEl = from.getElementsByTagNameNS('*', 'col')[0];
      const rowEl = from.getElementsByTagNameNS('*', 'row')[0];
      const col = colEl ? parseInt(colEl.textContent, 10) : null;
      const row = rowEl ? parseInt(rowEl.textContent, 10) : null;
      if (col !== 0 || row == null) continue; // solo fotos de producto (columna A)

      const blip = anchor.getElementsByTagNameNS('*', 'blip')[0];
      if (!blip) continue;
      const embedId = attr(blip, 'r:embed');
      const rutaMedia = embedId && embedARuta[embedId];
      if (!rutaMedia || filaARuta.has(row)) continue;
      filaARuta.set(row, rutaMedia);
    }

    const cacheMedia = new Map();
    const porFila = new Map();
    for (const [row, rutaMedia] of filaARuta) {
      if (!cacheMedia.has(rutaMedia)) {
        const mf = zip.file(rutaMedia);
        if (!mf) continue;
        cacheMedia.set(rutaMedia, await mf.async('blob'));
      }
      porFila.set(row, cacheMedia.get(rutaMedia));
    }
    return porFila;
  }

  /* Devuelve { [nombreHoja]: Map<filaExcel0Indexada, Blob> }. Nunca lanza: si algo
     no calza con lo esperado, esa hoja (o todo) queda simplemente sin imágenes. */
  async function extraer(arrayBuffer, nombresHojas) {
    const resultado = {};
    try {
      const zip = await JSZip.loadAsync(arrayBuffer);
      const parser = new DOMParser();
      const hojaARuta = await mapaHojaARuta(zip, parser);
      for (const nombreHoja of nombresHojas) {
        const rutaHoja = hojaARuta[nombreHoja];
        if (!rutaHoja) continue;
        try {
          resultado[nombreHoja] = await imagenesDeHoja(zip, parser, rutaHoja);
        } catch (e) {
          console.warn('No se pudieron leer imágenes de la hoja', nombreHoja, e);
        }
      }
    } catch (e) {
      console.warn('No se pudieron leer imágenes del archivo', e);
    }
    return resultado;
  }

  return { extraer };
})();
