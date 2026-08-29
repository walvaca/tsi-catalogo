/* Asistente de importación. Dos caminos:
   - GVS: formato fijo ya mapeado (parser-gvs.js), solo pide el archivo.
   - Genérico (Tecnomax u otro): si no hay perfil guardado, pide mapear
     columnas una vez; luego lo reutiliza en cada reimporte. */
var TC = window.TC || (window.TC = {});

TC.importWizard = (function () {
  const CAMPOS_MAPEO = [
    { key: 'codigo', label: 'Código *' },
    { key: 'descripcion', label: 'Descripción *' },
    { key: 'precioSinIVA', label: 'Precio sin IVA' },
    { key: 'precioConIVA', label: 'Precio con IVA' },
    { key: 'marca', label: 'Marca' },
    { key: 'categoria', label: 'Categoría' },
    { key: 'subcategoria', label: 'Subcategoría' },
    { key: 'textoStock', label: 'Texto de existencia/stock' },
    { key: 'urlFicha', label: 'URL ficha técnica' }
  ];

  let state = {};
  let onImportado = null;
  let els = {};

  function $(id) { return document.getElementById(id); }

  function init(callbackImportado) {
    onImportado = callbackImportado;
    els = {
      modal: $('modalImportar'),
      btnCerrar: $('wizCerrar'),
      pasoStart: $('wizStart'),
      pasoHojas: $('wizHojas'),
      pasoMapeo: $('wizMapeo'),
      pasoConfirmar: $('wizConfirmar'),
      inputArchivoGVS: $('wizArchivoGVS'),
      inputProveedorGenerico: $('wizProveedorGenerico'),
      inputArchivoGenerico: $('wizArchivoGenerico'),
      listaHojas: $('wizListaHojas'),
      btnContinuarHojas: $('wizContinuarHojas'),
      previewTabla: $('wizPreviewTabla'),
      mapeoForm: $('wizMapeoForm'),
      filaInicio: $('wizFilaInicio'),
      ivaPorcentaje: $('wizIvaPorcentaje'),
      btnGuardarMapeo: $('wizGuardarMapeo'),
      confirmResumen: $('wizConfirmResumen'),
      confirmMuestra: $('wizConfirmMuestra'),
      btnConfirmarImport: $('wizConfirmarImport'),
      btnEditarMapeo: $('wizEditarMapeo')
    };

    els.btnCerrar.addEventListener('click', cerrar);
    els.modal.addEventListener('click', e => { if (e.target === els.modal) cerrar(); });
    els.inputArchivoGVS.addEventListener('change', onArchivoGVS);
    els.inputArchivoGenerico.addEventListener('change', onArchivoGenerico);
    els.btnContinuarHojas.addEventListener('click', onContinuarHojas);
    els.btnGuardarMapeo.addEventListener('click', onGuardarMapeo);
    els.btnConfirmarImport.addEventListener('click', onConfirmarImport);
    els.btnEditarMapeo.addEventListener('click', () => mostrarPaso('mapeo'));
  }

  function abrir() {
    limpiarUrlsPreview();
    state = {};
    els.inputArchivoGVS.value = '';
    els.inputArchivoGenerico.value = '';
    els.inputProveedorGenerico.value = 'TECNOMAX';
    mostrarPaso('start');
    els.modal.classList.remove('hidden');
  }

  function cerrar() {
    limpiarUrlsPreview();
    els.modal.classList.add('hidden');
  }

  function mostrarPaso(nombre) {
    ['start', 'hojas', 'mapeo', 'confirmar'].forEach(p => {
      els['paso' + p[0].toUpperCase() + p.slice(1)].classList.toggle('hidden', p !== nombre);
    });
  }

  function leerArchivo(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  async function onArchivoGVS(e) {
    const file = e.target.files[0];
    if (!file) return;
    const buf = await leerArchivo(file);
    const workbook = XLSX.read(buf, { type: 'array' });
    const resultado = TC.parserGVS.parseWorkbook(workbook);
    state = {
      proveedor: 'GVS',
      archivoNombre: file.name,
      productos: resultado.productos,
      fechaProveedor: resultado.fechaProveedor,
      hojasProcesadas: resultado.hojasProcesadas,
      hojasIgnoradas: resultado.hojasIgnoradas
    };
    await procesarImagenesYConfirmar(buf, false);
  }

  async function onArchivoGenerico(e) {
    const file = e.target.files[0];
    if (!file) return;
    const proveedor = (els.inputProveedorGenerico.value || 'PROVEEDOR').trim().toUpperCase();
    const buf = await leerArchivo(file);
    const workbook = XLSX.read(buf, { type: 'array' });
    state = { proveedor, archivoNombre: file.name, workbook, arrayBuffer: buf };

    const perfil = await TC.db.getPerfil(proveedor);
    if (perfil) {
      state.perfil = perfil;
      const resultado = TC.parserGenerico.parseWorkbook(workbook, perfil);
      state.productos = resultado.productos;
      state.hojasProcesadas = resultado.hojasProcesadas;
      state.fechaProveedor = null;
      // dejar la hoja de mapeo lista por si el usuario aprieta "Editar mapeo":
      // el perfil guardado pudo haberse hecho contra un archivo con otras columnas.
      state.hojasSeleccionadas = perfil.hojas.filter(h => workbook.SheetNames.includes(h));
      if (state.hojasSeleccionadas.length === 0) state.hojasSeleccionadas = workbook.SheetNames;
      renderListaHojas(workbook.SheetNames, state.hojasSeleccionadas);
      renderMapeo(state.hojasSeleccionadas[0]);
      await procesarImagenesYConfirmar(buf, true);
    } else {
      renderListaHojas(workbook.SheetNames);
      mostrarPaso('hojas');
    }
  }

  function renderListaHojas(nombres, marcadas) {
    marcadas = marcadas || [nombres[0]];
    els.listaHojas.innerHTML = nombres.map((n) => `
      <label class="check-row">
        <input type="checkbox" value="${TC.ui.escapeHtml(n)}" ${marcadas.includes(n) ? 'checked' : ''}>
        ${TC.ui.escapeHtml(n)}
      </label>`).join('');
  }

  function onContinuarHojas() {
    const marcados = Array.from(els.listaHojas.querySelectorAll('input:checked')).map(i => i.value);
    if (marcados.length === 0) { alert('Selecciona al menos una hoja.'); return; }
    state.hojasSeleccionadas = marcados;
    renderMapeo(marcados[0]);
    mostrarPaso('mapeo');
  }

  function renderMapeo(nombreHoja) {
    const ws = state.workbook.Sheets[nombreHoja];
    const { ancho, filas } = TC.parserGenerico.previewFilas(ws, 10);

    const encabezado = Array.from({ length: ancho }, (_, c) => TC.parserGenerico.colLetter(c));
    els.previewTabla.innerHTML = '<table><thead><tr>' +
      encabezado.map(h => `<th>${h}</th>`).join('') + '</tr></thead><tbody>' +
      filas.map(fila => '<tr>' + fila.map(v => `<td>${TC.ui.escapeHtml(v)}</td>`).join('') + '</tr>').join('') +
      '</tbody></table>';

    const opciones = '<option value="">No aplica</option>' +
      encabezado.map((h, c) => `<option value="${c}">Columna ${h}</option>`).join('');

    els.mapeoForm.innerHTML = CAMPOS_MAPEO.map(campo => `
      <div class="mapeo-row">
        <label>${campo.label}</label>
        <select data-campo="${campo.key}">${opciones}</select>
      </div>`).join('');

    const filaInicioSugerida = TC.parserGenerico.sugerirFilaInicio(ws);
    const colCodigoSugerida = TC.parserGenerico.sugerirColumnaCodigo(ws, filaInicioSugerida, ancho);
    const selCodigo = els.mapeoForm.querySelector('[data-campo="codigo"]');
    selCodigo.value = String(colCodigoSugerida);
    els.filaInicio.value = filaInicioSugerida;
    els.ivaPorcentaje.value = 19;
  }

  async function onGuardarMapeo() {
    const mapeo = {};
    els.mapeoForm.querySelectorAll('select').forEach(sel => {
      const campo = sel.dataset.campo;
      mapeo[campo] = sel.value === '' ? null : parseInt(sel.value, 10);
    });
    if (mapeo.codigo == null) { alert('Debes mapear la columna de Código.'); return; }

    const perfil = {
      proveedor: state.proveedor,
      hojas: state.hojasSeleccionadas,
      filaInicio: parseInt(els.filaInicio.value, 10) || 0,
      ivaPorcentaje: parseFloat(els.ivaPorcentaje.value) || 19,
      mapeo
    };
    state.perfil = perfil;
    const resultado = TC.parserGenerico.parseWorkbook(state.workbook, perfil);
    state.productos = resultado.productos;
    state.hojasProcesadas = resultado.hojasProcesadas;
    await procesarImagenesYConfirmar(state.arrayBuffer, true);
  }

  function limpiarUrlsPreview() {
    (state.previewUrls || []).forEach(u => URL.revokeObjectURL(u));
    state.previewUrls = [];
  }

  async function procesarImagenesYConfirmar(arrayBuffer, esGenerico) {
    mostrarPaso('confirmar');
    els.confirmResumen.textContent = 'Procesando catálogo y buscando fotos de producto...';
    els.confirmMuestra.innerHTML = '';
    els.btnConfirmarImport.disabled = true;

    const porHoja = await TC.xlsxImagenes.extraer(arrayBuffer, state.hojasProcesadas);
    const imagenes = [];
    for (const p of state.productos) {
      const mapaHoja = porHoja[p._hojaExcel];
      const blob = mapaHoja && mapaHoja.get(p._filaExcel);
      if (blob) imagenes.push({ id: p.id, proveedor: state.proveedor, blob });
      delete p._filaExcel;
      delete p._hojaExcel;
    }
    state.imagenes = imagenes;

    els.btnConfirmarImport.disabled = false;
    mostrarConfirmacion(esGenerico, imagenes);
  }

  function mostrarConfirmacion(esGenerico, imagenes) {
    const fechaTxt = state.fechaProveedor ? ` · fecha del proveedor: ${TC.ui.escapeHtml(state.fechaProveedor)}` : '';
    const fotosTxt = imagenes.length ? ` · ${imagenes.length} con foto` : '';
    els.confirmResumen.innerHTML = `
      <b>${TC.ui.escapeHtml(state.proveedor)}</b> — ${state.productos.length} productos detectados
      en ${state.hojasProcesadas.length} hoja(s)${fechaTxt}${fotosTxt}.`;

    limpiarUrlsPreview();
    const imagenPorId = new Map(imagenes.map(img => [img.id, img.blob]));
    const muestra = state.productos.slice(0, 5).map(p => {
      const blob = imagenPorId.get(p.id);
      if (!blob) return p;
      const url = URL.createObjectURL(blob);
      state.previewUrls.push(url);
      return Object.assign({}, p, { _imagenUrl: url });
    });
    els.confirmMuestra.innerHTML = muestra.map(p => TC.ui.tarjetaProducto(p)).join('');
    els.btnEditarMapeo.classList.toggle('hidden', !esGenerico);
  }

  async function onConfirmarImport() {
    els.btnConfirmarImport.disabled = true;
    els.btnConfirmarImport.textContent = 'Guardando...';
    try {
      await TC.db.replaceProductos(state.proveedor, state.productos);
      await TC.db.replaceImagenes(state.proveedor, state.imagenes || []);
      if (state.perfil) await TC.db.putPerfil(state.perfil);
      await TC.db.putImportacion({
        proveedor: state.proveedor,
        fechaImportacionLocal: new Date().toISOString(),
        fechaProveedor: state.fechaProveedor,
        archivoNombre: state.archivoNombre,
        totalProductos: state.productos.length,
        hojasProcesadas: state.hojasProcesadas,
        hojasIgnoradas: state.hojasIgnoradas || []
      });
      cerrar();
      if (onImportado) onImportado();
    } finally {
      els.btnConfirmarImport.disabled = false;
      els.btnConfirmarImport.textContent = 'Confirmar importación';
    }
  }

  return { init, abrir };
})();
