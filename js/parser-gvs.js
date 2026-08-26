/* Parser específico del Excel de GVS. Cada hoja de categoría sigue un patrón
   tipo "catálogo impreso": fila de marca -> fila "Codigo"+subcategoría ->
   filas de producto, repetido varias veces. Verificado contra el archivo real
   (ListadoPreciosGVS.xlsx, 24 hojas, ~2049 productos, hipervínculo por código
   con el patrón https://www.gvscolombia.com/producto/<codigo>). */
var TC = window.TC || (window.TC = {});

TC.parserGVS = (function () {
  const COL = { MARCA: 0, CODIGO: 1, DESC: 2, PRECIO: 3, PRECIO_IVA: 4, DESCUENTO: 5, OFERTA: 6, VIGENCIA: 7, GRUPO: 8 };
  const RE_EXISTENCIA = /\*\*\s*existencia/i;
  const RE_EXISTENCIA_PREFIJO = /^\s*\*\*[^*]*\*\*\s*/;
  const RE_FECHA = /\d{1,2}\/\d{1,2}\/\d{2,4}.*\d{1,2}:\d{2}/;

  function cell(ws, r, c) {
    const addr = XLSX.utils.encode_cell({ r, c });
    return ws[addr];
  }
  function val(ws, r, c) {
    const cd = cell(ws, r, c);
    return cd && cd.v != null ? cd.v : null;
  }
  function str(v) {
    return v == null ? '' : String(v).trim();
  }
  function num(v) {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^\d.-]/g, ''));
    return isNaN(n) ? null : n;
  }

  function detectarFechaProveedor(ws, range) {
    for (let r = 0; r <= Math.min(4, range.e.r); r++) {
      for (let c = range.e.c; c >= 0; c--) {
        const v = val(ws, r, c);
        if (typeof v === 'string' && RE_FECHA.test(v)) return v.trim();
      }
    }
    return null;
  }

  function parseHoja(ws, nombreHoja) {
    const productos = [];
    if (!ws['!ref']) return { productos, fechaProveedor: null };
    const range = XLSX.utils.decode_range(ws['!ref']);
    const fechaProveedor = detectarFechaProveedor(ws, range);

    let marcaActual = '';
    let subcategoriaActual = '';

    for (let r = 0; r <= range.e.r; r++) {
      const cCodigo = str(val(ws, r, COL.CODIGO));
      const cDesc = val(ws, r, COL.DESC);
      const cMarca = str(val(ws, r, COL.MARCA));

      if (cCodigo.toLowerCase() === 'codigo') {
        subcategoriaActual = str(cDesc);
        continue;
      }
      if (cMarca && !cCodigo && !str(cDesc)) {
        marcaActual = cMarca;
        continue;
      }
      if (!cCodigo) continue;

      const descripcionRaw = str(cDesc);
      const existenciaUnica = RE_EXISTENCIA.test(descripcionRaw);
      const descripcion = descripcionRaw.replace(RE_EXISTENCIA_PREFIJO, '').trim();
      const codigoCell = cell(ws, r, COL.CODIGO);
      const urlFicha = (codigoCell && codigoCell.l && codigoCell.l.Target) || null;

      productos.push({
        id: `GVS::${cCodigo}`,
        proveedor: 'GVS',
        _filaExcel: r,
        _hojaExcel: nombreHoja,
        categoria: nombreHoja,
        marca: marcaActual,
        subcategoria: subcategoriaActual,
        codigo: cCodigo,
        descripcion: descripcion,
        precioSinIVA: num(val(ws, r, COL.PRECIO)),
        precioConIVA: num(val(ws, r, COL.PRECIO_IVA)),
        existenciaUnica: existenciaUnica,
        descuento: num(val(ws, r, COL.DESCUENTO)),
        precioOfertaConIVA: num(val(ws, r, COL.OFERTA)),
        vigenciaOferta: str(val(ws, r, COL.VIGENCIA)) || null,
        grupoProveedor: str(val(ws, r, COL.GRUPO)) || null,
        urlFicha: urlFicha
      });
    }
    return { productos, fechaProveedor };
  }

  function parseWorkbook(workbook) {
    const productos = [];
    const hojasProcesadas = [];
    const hojasIgnoradas = [];
    let fechaProveedor = null;

    for (const nombreHoja of workbook.SheetNames) {
      if (nombreHoja.trim().toUpperCase() === 'INDICE') {
        hojasIgnoradas.push(nombreHoja);
        continue;
      }
      const ws = workbook.Sheets[nombreHoja];
      const resultado = parseHoja(ws, nombreHoja);
      if (resultado.fechaProveedor && !fechaProveedor) fechaProveedor = resultado.fechaProveedor;
      productos.push(...resultado.productos);
      hojasProcesadas.push(nombreHoja);
    }

    return { productos, fechaProveedor, hojasProcesadas, hojasIgnoradas };
  }

  return { parseWorkbook };
})();
