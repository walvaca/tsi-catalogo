/* Parser genérico basado en un "perfil" de mapeo de columnas configurado por
   el usuario. Sirve para cualquier proveedor cuyo Excel sea una tabla plana
   con una fila de encabezados (ej. Tecnomax, o cualquier otro futuro), a
   diferencia del patrón especial "catálogo impreso" de GVS. */
var TC = window.TC || (window.TC = {});

TC.parserGenerico = (function () {
  function colLetter(c) {
    let s = '';
    c += 1;
    while (c > 0) {
      const m = (c - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      c = Math.floor((c - 1) / 26);
    }
    return s;
  }

  function sheetWidth(ws) {
    if (!ws['!ref']) return 0;
    return XLSX.utils.decode_range(ws['!ref']).e.c + 1;
  }
  function sheetHeight(ws) {
    if (!ws['!ref']) return 0;
    return XLSX.utils.decode_range(ws['!ref']).e.r + 1;
  }

  function val(ws, r, c) {
    const addr = XLSX.utils.encode_cell({ r, c });
    const cd = ws[addr];
    return cd && cd.v != null ? cd.v : null;
  }

  function filaComoTexto(ws, r, ancho) {
    const out = [];
    for (let c = 0; c < ancho; c++) {
      const v = val(ws, r, c);
      out.push(v == null ? '' : String(v));
    }
    return out;
  }

  function previewFilas(ws, n) {
    const ancho = sheetWidth(ws);
    const alto = sheetHeight(ws);
    const filas = [];
    for (let r = 0; r < Math.min(n, alto); r++) filas.push(filaComoTexto(ws, r, ancho));
    return { ancho, alto, filas };
  }

  function sugerirFilaInicio(ws) {
    const alto = sheetHeight(ws);
    const ancho = sheetWidth(ws);
    // una fila de encabezado es puro texto; una fila de datos real casi
    // siempre tiene al menos una celda numérica (precio, cantidad, etc.) en
    // ALGUNA columna — no hace falta saber todavía cuál es la de código.
    for (let r = 0; r < alto; r++) {
      for (let c = 0; c < ancho; c++) {
        if (typeof val(ws, r, c) === 'number') return r;
      }
    }
    return 0;
  }

  function sugerirColumnaCodigo(ws, filaInicio, ancho) {
    const alto = sheetHeight(ws);
    const filasMuestra = Math.min(30, alto - filaInicio);
    if (filasMuestra <= 0) return 0;
    let mejorCol = 0, mejorPuntaje = -1;
    for (let c = 0; c < ancho; c++) {
      const vistos = new Set();
      let noVacios = 0, conEspacio = 0;
      for (let r = filaInicio; r < filaInicio + filasMuestra; r++) {
        const v = val(ws, r, c);
        if (v == null || String(v).trim() === '') continue;
        const s = String(v).trim();
        noVacios++;
        if (/\s/.test(s)) conEspacio++;
        vistos.add(s);
      }
      if (noVacios === 0) continue;
      // un código de producto casi siempre es único por fila y sin espacios —
      // a diferencia de marca/categoría (se repiten mucho) o descripción (trae espacios)
      const ratioUnico = vistos.size / noVacios;
      const ratioSinEspacio = 1 - conEspacio / noVacios;
      const completitud = noVacios / filasMuestra;
      const puntaje = ratioUnico * ratioSinEspacio * completitud;
      if (puntaje > mejorPuntaje) { mejorPuntaje = puntaje; mejorCol = c; }
    }
    return mejorCol;
  }

  function num(v) {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^\d.-]/g, ''));
    return isNaN(n) ? null : n;
  }
  function str(v) {
    return v == null ? '' : String(v).trim();
  }

  /* perfil = { proveedor, hojas: [nombre,...], filaInicio, ivaPorcentaje,
     mapeo: { codigo, descripcion, precioSinIVA, precioConIVA, marca,
              categoria, subcategoria, textoStock, urlFicha } }  (índices de columna o null) */
  function parseHoja(ws, nombreHoja, perfil) {
    const productos = [];
    const alto = sheetHeight(ws);
    const m = perfil.mapeo;
    for (let r = perfil.filaInicio; r < alto; r++) {
      const codigo = str(val(ws, r, m.codigo));
      if (!codigo) continue;

      let precioSinIVA = m.precioSinIVA != null ? num(val(ws, r, m.precioSinIVA)) : null;
      let precioConIVA = m.precioConIVA != null ? num(val(ws, r, m.precioConIVA)) : null;
      const iva = (perfil.ivaPorcentaje != null ? perfil.ivaPorcentaje : 19) / 100;
      if (precioConIVA == null && precioSinIVA != null) precioConIVA = Math.round(precioSinIVA * (1 + iva));
      if (precioSinIVA == null && precioConIVA != null) precioSinIVA = Math.round(precioConIVA / (1 + iva));

      const textoStock = m.textoStock != null ? str(val(ws, r, m.textoStock)) : '';
      // "agotado" (sin unidades) es un estado distinto de "existencia única" (quedan pocas) —
      // nunca deben verse igual: a un cliente no se le puede decir "hay" cuando no queda nada.
      const agotado = /agotad/i.test(textoStock);
      const existenciaUnica = !agotado && /\*\*\s*existencia|\bunica\b|\bunico\b|\búnica\b|\búnico\b/i.test(textoStock);
      if (agotado) { precioSinIVA = null; precioConIVA = null; }

      productos.push({
        id: `${perfil.proveedor}::${codigo}`,
        proveedor: perfil.proveedor,
        _filaExcel: r,
        _hojaExcel: nombreHoja,
        categoria: m.categoria != null ? str(val(ws, r, m.categoria)) : nombreHoja,
        marca: m.marca != null ? str(val(ws, r, m.marca)) : '',
        subcategoria: m.subcategoria != null ? str(val(ws, r, m.subcategoria)) : '',
        codigo: codigo,
        descripcion: m.descripcion != null ? str(val(ws, r, m.descripcion)) : '',
        precioSinIVA: precioSinIVA,
        precioConIVA: precioConIVA,
        existenciaUnica: existenciaUnica,
        agotado: agotado,
        descuento: null,
        precioOfertaConIVA: null,
        vigenciaOferta: null,
        grupoProveedor: null,
        urlFicha: m.urlFicha != null ? (str(val(ws, r, m.urlFicha)) || null) : null
      });
    }
    return productos;
  }

  function parseWorkbook(workbook, perfil) {
    const productos = [];
    for (const nombreHoja of perfil.hojas) {
      const ws = workbook.Sheets[nombreHoja];
      if (!ws) continue;
      productos.push(...parseHoja(ws, nombreHoja, perfil));
    }
    return { productos, hojasProcesadas: perfil.hojas, fechaProveedor: null };
  }

  return { colLetter, sheetWidth, sheetHeight, previewFilas, sugerirFilaInicio, sugerirColumnaCodigo, parseWorkbook };
})();
