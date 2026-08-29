var TC = window.TC || (window.TC = {});

(function () {
  let productos = [];
  let overridesMap = new Map();
  let fusionado = [];
  let indice = [];
  let editandoId = null;
  let imagenUrls = new Map();

  const $ = id => document.getElementById(id);
  let els = {};

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  async function recargarImagenes() {
    const imagenes = await TC.db.getAllImagenes();
    for (const url of imagenUrls.values()) URL.revokeObjectURL(url);
    imagenUrls = new Map(imagenes.map(img => [img.id, URL.createObjectURL(img.blob)]));
  }

  async function recargarDatos() {
    [productos, overridesMap] = await Promise.all([TC.db.getAllProductos(), TC.db.getAllOverrides()]);
    await recargarImagenes();
    fusionado = TC.search.fusionar(productos, overridesMap);
    for (const p of fusionado) {
      const url = imagenUrls.get(p.id);
      if (url) p._imagenUrl = url;
    }
    indice = TC.search.construirIndice(fusionado);
    actualizarFiltroProveedor();
    actualizarFiltroCategoria();
    await actualizarStats();
    ejecutarBusqueda();
  }

  async function actualizarStats() {
    const importaciones = await TC.db.getImportaciones();
    TC.ui.renderStats(els.statsBar, importaciones, fusionado.length);
    els.emptyState.classList.toggle('hidden', importaciones.length > 0);
    els.buscadorWrap.classList.toggle('hidden', importaciones.length === 0);
  }

  function actualizarFiltroProveedor() {
    const proveedores = Array.from(new Set(fusionado.map(p => p.proveedor))).sort();
    TC.ui.llenarSelect(els.filtroProveedor, proveedores, 'Todos los proveedores');
  }

  function actualizarFiltroCategoria() {
    const categorias = TC.search.categoriasDisponibles(fusionado, els.filtroProveedor.value || null);
    TC.ui.llenarSelect(els.filtroCategoria, categorias, 'Todas las categorías');
  }

  function ejecutarBusqueda() {
    const resultados = TC.search.buscar(indice, els.inputBuscar.value, {
      proveedor: els.filtroProveedor.value || null,
      categoria: els.filtroCategoria.value || null
    });
    TC.ui.renderResultados(els.resultados, resultados);
  }

  function buscarProductoPorId(id) {
    return fusionado.find(p => p.id === id);
  }

  function onClickResultados(e) {
    const entry = e.target.closest('.entry');
    if (!entry) return;
    const id = entry.dataset.id;

    if (e.target.closest('.act-editar')) {
      abrirModalEditar(id);
    } else if (e.target.closest('.act-alternativas')) {
      const elAlt = entry.querySelector('.alternativas');
      const yaVisible = !elAlt.classList.contains('hidden');
      if (yaVisible) { elAlt.classList.add('hidden'); return; }
      const producto = buscarProductoPorId(id);
      const alts = TC.search.alternativas(fusionado, producto, 6);
      TC.ui.renderAlternativas(elAlt, alts);
      elAlt.classList.remove('hidden');
    } else if (e.target.closest('.act-agregar-cotizacion')) {
      const producto = buscarProductoPorId(id);
      TC.cotizador.agregar(producto);
      actualizarBadgeCotizacion();
      const btn = e.target.closest('.act-agregar-cotizacion');
      const original = btn.textContent;
      btn.textContent = 'Agregado ✓';
      setTimeout(() => { btn.textContent = original; }, 1200);
    }
  }

  // ===== Cotización =====

  function actualizarBadgeCotizacion() {
    const borrador = TC.cotizador.cargar();
    const n = borrador.items.length;
    els.badgeCotizacion.textContent = String(n);
    els.badgeCotizacion.classList.toggle('hidden', n === 0);
  }

  function renderCotizacionModal() {
    const borrador = TC.cotizador.cargar();
    els.cotClienteNombre.value = borrador.cliente.nombre || '';
    els.cotClienteTelefono.value = borrador.cliente.telefono || '';
    els.cotClienteEmpresa.value = borrador.cliente.empresa || '';
    els.cotClienteNit.value = borrador.cliente.nit || '';
    els.cotClienteDireccion.value = borrador.cliente.direccion || '';
    els.cotCiudadEntrega.value = borrador.cliente.ciudadEntrega || 'local';
    els.cotUtilidadGlobal.value = TC.cotizador.utilidadGlobal();

    const { items, total } = TC.cotizador.calcularTotales(borrador);
    els.cotVacio.classList.toggle('hidden', items.length > 0);
    TC.ui.renderCotizacionItems(els.cotItems, items);
    els.cotTotal.textContent = TC.ui.moneda(total);
  }

  function abrirCotizacion() {
    renderCotizacionModal();
    els.modalCotizacion.classList.remove('hidden');
  }

  function cerrarCotizacion() {
    els.modalCotizacion.classList.add('hidden');
  }

  function guardarClienteBorrador() {
    TC.cotizador.actualizarCliente({
      nombre: els.cotClienteNombre.value.trim(),
      telefono: els.cotClienteTelefono.value.trim(),
      empresa: els.cotClienteEmpresa.value.trim(),
      nit: els.cotClienteNit.value.trim(),
      direccion: els.cotClienteDireccion.value.trim(),
      ciudadEntrega: els.cotCiudadEntrega.value
    });
  }

  function onChangeCotItems(e) {
    const fila = e.target.closest('.cot-item');
    if (!fila) return;
    const productoId = fila.dataset.id;

    if (e.target.classList.contains('cot-cantidad')) {
      TC.cotizador.actualizarItem(productoId, { cantidad: parseInt(e.target.value, 10) || 1 });
    } else if (e.target.classList.contains('cot-margen')) {
      TC.cotizador.actualizarItem(productoId, { margenPorcentaje: parseFloat(e.target.value) || 0 });
    } else if (e.target.classList.contains('cot-precio')) {
      TC.cotizador.actualizarItem(productoId, { precioVenta: parseFloat(e.target.value) || 0 });
    } else {
      return;
    }
    renderCotizacionModal();
  }

  function onClickCotItems(e) {
    if (!e.target.closest('.cot-item-quitar')) return;
    const fila = e.target.closest('.cot-item');
    TC.cotizador.quitar(fila.dataset.id);
    renderCotizacionModal();
    actualizarBadgeCotizacion();
  }

  async function generarPdfDesdeBorrador() {
    guardarClienteBorrador();
    const borrador = TC.cotizador.cargar();
    if (!borrador.items.length) { alert('Agrega al menos un producto a la cotización.'); return; }
    if (!borrador.cliente.nombre) { alert('Escribe el nombre del cliente.'); return; }

    els.btnGenerarPdf.disabled = true;
    els.btnGenerarPdf.textContent = 'Generando...';
    try {
      const cotizacion = await TC.cotizador.finalizar(borrador.cliente);
      const config = await TC.db.getConfigNegocio();
      const blob = await TC.pdfCotizacion.generar(cotizacion, config);
      await TC.db.putCotizacion(Object.assign({}, cotizacion, { pdfBlob: blob }));
      TC.cotizador.vaciar();
      actualizarBadgeCotizacion();
      cerrarCotizacion();
      ofrecerPdf(blob, cotizacion.numero);
    } catch (err) {
      console.error(err);
      alert('No se pudo generar el PDF. Revisa la consola para más detalle.');
    } finally {
      els.btnGenerarPdf.disabled = false;
      els.btnGenerarPdf.textContent = 'Generar PDF';
    }
  }

  function ofrecerPdf(blob, numero) {
    const archivo = new File([blob], `cotizacion-${numero}.pdf`, { type: 'application/pdf' });
    const puedeCompartir = !!(navigator.canShare && navigator.canShare({ files: [archivo] }));
    els.btnCompartirPdf.classList.toggle('hidden', !puedeCompartir);
    els.pdfListoNumero.textContent = numero;

    els.btnCompartirPdf.onclick = () => {
      navigator.share({ files: [archivo], title: `Cotización ${numero}`, text: 'Aquí tienes tu cotización.' }).catch(() => {});
    };
    els.btnDescargarPdf.onclick = () => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cotizacion-${numero}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    };
    els.modalPdfListo.classList.remove('hidden');
  }

  // ===== Datos del negocio =====

  let logoNuevoTemp = null;

  async function abrirNegocio() {
    logoNuevoTemp = null;
    const cfg = await TC.db.getConfigNegocio();
    els.negNombre.value = cfg.nombreNegocio || '';
    els.negNit.value = cfg.nit || '';
    els.negTelefono.value = cfg.telefono || '';
    els.negLogo.value = '';
    els.negLogoPreview.innerHTML = cfg.logoBlob
      ? `<img src="${URL.createObjectURL(cfg.logoBlob)}" style="height:48px;border-radius:8px">` : '';
    els.modalNegocio.classList.remove('hidden');
  }

  function onCambiaLogo(e) {
    const file = e.target.files[0];
    if (!file) return;
    logoNuevoTemp = file;
    els.negLogoPreview.innerHTML = `<img src="${URL.createObjectURL(file)}" style="height:48px;border-radius:8px">`;
  }

  async function guardarNegocio() {
    const cfg = await TC.db.getConfigNegocio();
    await TC.db.putConfigNegocio({
      nombreNegocio: els.negNombre.value.trim(),
      nit: els.negNit.value.trim(),
      telefono: els.negTelefono.value.trim(),
      logoBlob: logoNuevoTemp || cfg.logoBlob,
      siguienteNumero: cfg.siguienteNumero
    });
    els.modalNegocio.classList.add('hidden');
  }

  // ===== Historial =====

  let historialCache = [];

  async function abrirHistorial() {
    historialCache = await TC.db.getCotizaciones();
    TC.ui.renderHistorial(els.histLista, historialCache);
    els.modalHistorial.classList.remove('hidden');
  }

  function onClickHistorial(e) {
    if (!e.target.closest('.hist-reenviar')) return;
    const fila = e.target.closest('.hist-row');
    const cot = historialCache.find(c => c.id === fila.dataset.id);
    if (cot && cot.pdfBlob) ofrecerPdf(cot.pdfBlob, cot.numero);
  }

  function abrirModalEditar(id) {
    const producto = buscarProductoPorId(id);
    if (!producto) return;
    editandoId = id;
    const ov = overridesMap.get(id);
    els.editTitulo.textContent = `${producto.codigo} — ${producto.descripcion || ''}`;
    els.editPrecio.value = ov && ov.precioConIVAOverride != null ? ov.precioConIVAOverride : '';
    els.editPrecio.placeholder = 'Precio de lista: ' + TC.ui.moneda(producto._precioConIVAOriginal != null ? producto._precioConIVAOriginal : producto.precioConIVA);
    els.editNota.value = ov && ov.nota ? ov.nota : '';
    els.btnQuitarEdit.classList.toggle('hidden', !ov);
    els.modalEditar.classList.remove('hidden');
  }

  function cerrarModalEditar() {
    els.modalEditar.classList.add('hidden');
    editandoId = null;
  }

  async function guardarEdicion() {
    if (!editandoId) return;
    const precio = els.editPrecio.value.trim() === '' ? null : parseFloat(els.editPrecio.value);
    const nota = els.editNota.value.trim() || null;
    if (precio == null && nota == null) {
      await TC.db.deleteOverride(editandoId);
    } else {
      await TC.db.putOverride({
        id: editandoId,
        precioConIVAOverride: precio,
        precioSinIVAOverride: null,
        nota: nota,
        actualizadoEn: new Date().toISOString()
      });
    }
    cerrarModalEditar();
    await recargarDatos();
  }

  async function quitarEdicion() {
    if (!editandoId) return;
    await TC.db.deleteOverride(editandoId);
    cerrarModalEditar();
    await recargarDatos();
  }

  function init() {
    els = {
      statsBar: $('statsBar'),
      emptyState: $('emptyState'),
      buscadorWrap: $('buscadorWrap'),
      inputBuscar: $('inputBuscar'),
      filtroProveedor: $('filtroProveedor'),
      filtroCategoria: $('filtroCategoria'),
      resultados: $('resultados'),
      btnImportar: $('btnImportar'),
      btnImportarVacio: $('btnImportarVacio'),
      modalEditar: $('modalEditar'),
      editTitulo: $('editTitulo'),
      editPrecio: $('editPrecio'),
      editNota: $('editNota'),
      btnGuardarEdit: $('btnGuardarEdit'),
      btnQuitarEdit: $('btnQuitarEdit'),
      btnCerrarEdit: $('btnCerrarEdit'),

      btnCotizacion: $('btnCotizacion'),
      badgeCotizacion: $('badgeCotizacion'),
      modalCotizacion: $('modalCotizacion'),
      btnCerrarCotizacion: $('btnCerrarCotizacion'),
      lnkDatosNegocio: $('lnkDatosNegocio'),
      lnkHistorial: $('lnkHistorial'),
      cotClienteNombre: $('cotClienteNombre'),
      cotClienteTelefono: $('cotClienteTelefono'),
      cotClienteEmpresa: $('cotClienteEmpresa'),
      cotClienteNit: $('cotClienteNit'),
      cotClienteDireccion: $('cotClienteDireccion'),
      cotCiudadEntrega: $('cotCiudadEntrega'),
      cotUtilidadGlobal: $('cotUtilidadGlobal'),
      btnAplicarUtilidad: $('btnAplicarUtilidad'),
      cotItems: $('cotItems'),
      cotVacio: $('cotVacio'),
      cotTotal: $('cotTotal'),
      btnVaciarCotizacion: $('btnVaciarCotizacion'),
      btnGenerarPdf: $('btnGenerarPdf'),

      modalNegocio: $('modalNegocio'),
      btnCerrarNegocio: $('btnCerrarNegocio'),
      negNombre: $('negNombre'),
      negNit: $('negNit'),
      negTelefono: $('negTelefono'),
      negLogo: $('negLogo'),
      negLogoPreview: $('negLogoPreview'),
      btnGuardarNegocio: $('btnGuardarNegocio'),

      modalHistorial: $('modalHistorial'),
      btnCerrarHistorial: $('btnCerrarHistorial'),
      histLista: $('histLista'),

      modalPdfListo: $('modalPdfListo'),
      btnCerrarPdfListo: $('btnCerrarPdfListo'),
      pdfListoNumero: $('pdfListoNumero'),
      btnCompartirPdf: $('btnCompartirPdf'),
      btnDescargarPdf: $('btnDescargarPdf')
    };

    TC.importWizard.init(recargarDatos);

    els.inputBuscar.addEventListener('input', debounce(ejecutarBusqueda, 120));
    els.filtroProveedor.addEventListener('change', () => { actualizarFiltroCategoria(); ejecutarBusqueda(); });
    els.filtroCategoria.addEventListener('change', ejecutarBusqueda);
    els.resultados.addEventListener('click', onClickResultados);
    els.btnImportar.addEventListener('click', () => TC.importWizard.abrir());
    els.btnImportarVacio.addEventListener('click', () => TC.importWizard.abrir());
    els.btnGuardarEdit.addEventListener('click', guardarEdicion);
    els.btnQuitarEdit.addEventListener('click', quitarEdicion);
    els.btnCerrarEdit.addEventListener('click', cerrarModalEditar);
    els.modalEditar.addEventListener('click', e => { if (e.target === els.modalEditar) cerrarModalEditar(); });

    els.btnCotizacion.addEventListener('click', abrirCotizacion);
    els.btnCerrarCotizacion.addEventListener('click', () => { guardarClienteBorrador(); cerrarCotizacion(); });
    els.modalCotizacion.addEventListener('click', e => { if (e.target === els.modalCotizacion) { guardarClienteBorrador(); cerrarCotizacion(); } });
    [els.cotClienteNombre, els.cotClienteTelefono, els.cotClienteEmpresa, els.cotClienteNit,
     els.cotClienteDireccion, els.cotCiudadEntrega].forEach(input =>
      input.addEventListener('change', guardarClienteBorrador));
    els.cotItems.addEventListener('change', onChangeCotItems);
    els.cotItems.addEventListener('click', onClickCotItems);
    els.btnAplicarUtilidad.addEventListener('click', () => {
      TC.cotizador.aplicarUtilidadATodos(parseFloat(els.cotUtilidadGlobal.value) || 0);
      renderCotizacionModal();
    });
    els.btnVaciarCotizacion.addEventListener('click', () => {
      if (!confirm('¿Vaciar la cotización en curso? Esto no afecta el historial ya guardado.')) return;
      TC.cotizador.vaciar();
      renderCotizacionModal();
      actualizarBadgeCotizacion();
    });
    els.btnGenerarPdf.addEventListener('click', generarPdfDesdeBorrador);

    els.lnkDatosNegocio.addEventListener('click', abrirNegocio);
    els.btnCerrarNegocio.addEventListener('click', () => els.modalNegocio.classList.add('hidden'));
    els.modalNegocio.addEventListener('click', e => { if (e.target === els.modalNegocio) els.modalNegocio.classList.add('hidden'); });
    els.negLogo.addEventListener('change', onCambiaLogo);
    els.btnGuardarNegocio.addEventListener('click', guardarNegocio);

    els.lnkHistorial.addEventListener('click', abrirHistorial);
    els.btnCerrarHistorial.addEventListener('click', () => els.modalHistorial.classList.add('hidden'));
    els.modalHistorial.addEventListener('click', e => { if (e.target === els.modalHistorial) els.modalHistorial.classList.add('hidden'); });
    els.histLista.addEventListener('click', onClickHistorial);

    els.btnCerrarPdfListo.addEventListener('click', () => els.modalPdfListo.classList.add('hidden'));
    els.modalPdfListo.addEventListener('click', e => { if (e.target === els.modalPdfListo) els.modalPdfListo.classList.add('hidden'); });

    actualizarBadgeCotizacion();
    recargarDatos();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
