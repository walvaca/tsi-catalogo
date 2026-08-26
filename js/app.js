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
    }
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
      btnCerrarEdit: $('btnCerrarEdit')
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

    recargarDatos();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
