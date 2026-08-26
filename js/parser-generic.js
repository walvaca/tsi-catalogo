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

  function sugerirFilaInicio(ws, colCodigo) {
    const alto = sheetHeight(ws);
    const ancho = sheetWidth(ws);
    for (let r = 0; r < alto; r++) {
      const v = val(ws, r, colCodigo);
      if (v == null || String(v).trim() === '') continue;
      // una fila de encabezado es puro texto; una fila de datos real casi
      // siempre tiene al menos una celda numérica (precio, cantidad, etc.)
      let tieneNumero = false;
      for (let c = 0; c < ancho; c++) {
        if (typeof val(ws, r, c) === 'number') { tieneNumero = true; break; }
      }
      if (tieneNumero) return r;
    }
    return 0;
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

      productos.push({
        id: `${perfil.proveedor}::${codigo}`,
        proveedor: perfil.proveedor,
        categoria: m.categoria != null ? str(val(ws, r, m.categoria)) : nombreHoja,
        marca: m.marca != null ? str(val(ws, r, m.marca)) : '',
        subcategoria: m.subcategoria != null ? str(val(ws, r, m.subcategoria)) : '',
        codigo: codigo,
        descripcion: m.descripcion != null ? str(val(ws, r, m.descripcion)) : '',
        precioSinIVA: precioSinIVA,
        precioConIVA: precioConIVA,
        existenciaUnica: /\*\*\s*existencia|unica|único|agotado/i.test(textoStock),
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

  return { colLetter, sheetWidth, sheetHeight, previewFilas, sugerirFilaInicio, parseWorkbook };
})();
