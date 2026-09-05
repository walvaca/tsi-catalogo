var TC = window.TC || (window.TC = {});

(function () {
  let productos = [];
  let overridesMap = new Map();
  let fusionado = [];
  let indice = [];
  let editandoId = null;
  let imagenUrls = new Map();

  // CRM: clientes / casos
  let clientesCacheCRM = [];
  let clienteActualCRM = null;
  let casoActualCRM = null;
  let tipoCasoNuevo = null;
  let modoClienteForm = 'crear';
  let eventoArchivoUrls = new Map();

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
    actualizarFiltroSubcategoria();
    actualizarFiltroMarca();
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

  function actualizarFiltroSubcategoria() {
    const subcategorias = TC.search.subcategoriasDisponibles(
      fusionado, els.filtroProveedor.value || null, els.filtroCategoria.value || null);
    TC.ui.llenarSelect(els.filtroSubcategoria, subcategorias, 'Todas las subcategorías');
  }

  function actualizarFiltroMarca() {
    const marcas = TC.search.marcasDisponibles(
      fusionado, els.filtroProveedor.value || null, els.filtroCategoria.value || null);
    TC.ui.llenarSelect(els.filtroMarca, marcas, 'Todas las marcas');
  }

  function limpiarFiltros() {
    els.inputBuscar.value = '';
    els.filtroProveedor.value = '';
    els.filtroCategoria.value = '';
    els.filtroSubcategoria.value = '';
    els.filtroMarca.value = '';
    els.filtroDisponibilidad.value = '';
    actualizarFiltroCategoria();
    actualizarFiltroSubcategoria();
    actualizarFiltroMarca();
    ejecutarBusqueda();
  }

  function ejecutarBusqueda() {
    const resultados = TC.search.buscar(indice, els.inputBuscar.value, {
      proveedor: els.filtroProveedor.value || null,
      categoria: els.filtroCategoria.value || null,
      subcategoria: els.filtroSubcategoria.value || null,
      marca: els.filtroMarca.value || null,
      disponibilidad: els.filtroDisponibilidad.value || null
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
    actualizarVinculoClienteUI(borrador.cliente.crmClienteId);

    const { items, total } = TC.cotizador.calcularTotales(borrador);
    els.cotVacio.classList.toggle('hidden', items.length > 0);
    TC.ui.renderCotizacionItems(els.cotItems, items);
    els.cotTotal.textContent = TC.ui.moneda(total);
  }

  async function abrirCotizacion() {
    clientesCacheCRM = await TC.crm.listarClientes();
    renderCotizacionModal();
    els.modalCotizacion.classList.remove('hidden');
  }

  function actualizarVinculoClienteUI(crmClienteId) {
    const vinculado = !!crmClienteId;
    els.cotClienteBuscar.classList.toggle('hidden', vinculado);
    els.cotClienteSugerencias.classList.add('hidden');
    els.cotClienteVinculadoInfo.classList.toggle('hidden', !vinculado);
    if (vinculado) {
      const cliente = clientesCacheCRM.find(c => c.id === crmClienteId);
      els.cotClienteVinculadoNombre.textContent = cliente ? cliente.nombre : '(cliente)';
    } else {
      els.cotClienteBuscar.value = '';
    }
  }

  function onInputClienteBuscar() {
    const q = els.cotClienteBuscar.value.trim();
    if (!q) { els.cotClienteSugerencias.classList.add('hidden'); return; }
    const coincidencias = TC.crm.filtrarClientes(clientesCacheCRM, q);
    TC.ui.renderSugerenciasCliente(els.cotClienteSugerencias, coincidencias);
    els.cotClienteSugerencias.insertAdjacentHTML('beforeend',
      `<div class="sugerencia-cliente" data-crear-nuevo="1"><b>＋ Crear cliente nuevo: "${TC.ui.escapeHtml(q)}"</b></div>`);
    els.cotClienteSugerencias.classList.remove('hidden');
  }

  async function onClickClienteSugerencias(e) {
    const fila = e.target.closest('.sugerencia-cliente');
    if (!fila) return;
    let clienteId;
    if (fila.dataset.crearNuevo) {
      const nombre = els.cotClienteNombre.value.trim() || els.cotClienteBuscar.value.trim();
      const cliente = await TC.crm.crearCliente({
        nombre,
        telefono: els.cotClienteTelefono.value.trim(),
        empresa: els.cotClienteEmpresa.value.trim(),
        nit: els.cotClienteNit.value.trim()
      });
      clientesCacheCRM.push(cliente);
      clienteId = cliente.id;
    } else {
      clienteId = fila.dataset.id;
    }
    TC.cotizador.actualizarCliente({ crmClienteId: clienteId });
    const cliente = clientesCacheCRM.find(c => c.id === clienteId);
    if (cliente) {
      if (!els.cotClienteNombre.value.trim()) els.cotClienteNombre.value = cliente.nombre || '';
      if (!els.cotClienteTelefono.value.trim()) els.cotClienteTelefono.value = cliente.telefono || '';
      if (!els.cotClienteEmpresa.value.trim()) els.cotClienteEmpresa.value = cliente.empresa || '';
      if (!els.cotClienteNit.value.trim()) els.cotClienteNit.value = cliente.nit || '';
      guardarClienteBorrador();
    }
    renderCotizacionModal();
  }

  function quitarVinculoCliente() {
    TC.cotizador.actualizarCliente({ crmClienteId: null });
    renderCotizacionModal();
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
      if (cotizacion.cliente.crmClienteId) {
        try { await vincularCotizacionACaso(cotizacion.cliente.crmClienteId, cotizacion); }
        catch (err) { console.error('No se pudo vincular la cotización al CRM:', err); }
      }
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

  async function vincularCotizacionACaso(clienteId, cotizacion) {
    const casos = await TC.crm.listarCasosPorCliente(clienteId);
    let caso = casos.find(c => c.tipo === 'producto' && c.etapaActual !== 'cerrado');
    if (!caso) caso = await TC.crm.crearCaso(clienteId, 'producto', `Cotización No. ${cotizacion.numero}`);
    await TC.crm.agregarEvento(caso.id, {
      tipo: 'cotizacion', fecha: cotizacion.fecha,
      descripcion: `Cotización No. ${cotizacion.numero} — ${TC.ui.moneda(cotizacion.total)}`,
      cotizacionId: cotizacion.id
    });
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

  // ===== CRM: clientes y casos =====

  function mostrarPanelClientes(nombre) {
    ['clnListado', 'clnNuevoCliente', 'clnDetalleCliente', 'clnDetalleCaso'].forEach(id => {
      els[id].classList.toggle('hidden', id !== nombre);
    });
  }

  async function abrirClientes() {
    clientesCacheCRM = await TC.crm.listarClientes();
    TC.ui.renderClientes(els.clnListaClientes, clientesCacheCRM);
    els.clnBuscarCliente.value = '';
    mostrarPanelClientes('clnListado');
    els.modalClientes.classList.remove('hidden');
  }

  function cerrarClientes() {
    els.modalClientes.classList.add('hidden');
  }

  function onInputBuscarClientes() {
    const filtrados = TC.crm.filtrarClientes(clientesCacheCRM, els.clnBuscarCliente.value);
    TC.ui.renderClientes(els.clnListaClientes, filtrados);
  }

  function onClickListaClientes(e) {
    const fila = e.target.closest('.cln-cliente-row');
    if (!fila) return;
    abrirDetalleCliente(fila.dataset.id);
  }

  function limpiarFormCliente() {
    ['clnNombre', 'clnEmpresa', 'clnNit', 'clnTelefono', 'clnEmail', 'clnDireccion', 'clnCiudad', 'clnNotas']
      .forEach(id => { els[id].value = ''; });
  }

  function abrirFormNuevoCliente() {
    modoClienteForm = 'crear';
    limpiarFormCliente();
    els.clnVolverForm.dataset.volver = 'clnListado';
    mostrarPanelClientes('clnNuevoCliente');
  }

  function abrirFormEditarCliente() {
    if (!clienteActualCRM) return;
    modoClienteForm = 'editar';
    els.clnNombre.value = clienteActualCRM.nombre || '';
    els.clnEmpresa.value = clienteActualCRM.empresa || '';
    els.clnNit.value = clienteActualCRM.nit || '';
    els.clnTelefono.value = clienteActualCRM.telefono || '';
    els.clnEmail.value = clienteActualCRM.email || '';
    els.clnDireccion.value = clienteActualCRM.direccion || '';
    els.clnCiudad.value = clienteActualCRM.ciudad || '';
    els.clnNotas.value = clienteActualCRM.notas || '';
    els.clnVolverForm.dataset.volver = 'clnDetalleCliente';
    mostrarPanelClientes('clnNuevoCliente');
  }

  async function guardarCliente() {
    const datos = {
      nombre: els.clnNombre.value.trim(),
      empresa: els.clnEmpresa.value.trim(),
      nit: els.clnNit.value.trim(),
      telefono: els.clnTelefono.value.trim(),
      email: els.clnEmail.value.trim(),
      direccion: els.clnDireccion.value.trim(),
      ciudad: els.clnCiudad.value.trim(),
      notas: els.clnNotas.value.trim()
    };
    if (!datos.nombre) { alert('Escribe el nombre del cliente.'); return; }

    let clienteId;
    if (modoClienteForm === 'editar' && clienteActualCRM) {
      await TC.crm.actualizarCliente(clienteActualCRM.id, datos);
      clienteId = clienteActualCRM.id;
    } else {
      const cliente = await TC.crm.crearCliente(datos);
      clienteId = cliente.id;
    }
    clientesCacheCRM = await TC.crm.listarClientes();
    await abrirDetalleCliente(clienteId);
  }

  async function abrirDetalleCliente(clienteId) {
    clienteActualCRM = await TC.crm.obtenerCliente(clienteId);
    if (!clienteActualCRM) return;
    els.clnDetalleNombre.textContent = clienteActualCRM.nombre || '(sin nombre)';
    els.clnDetalleMeta.textContent = [clienteActualCRM.empresa, clienteActualCRM.telefono, clienteActualCRM.email]
      .filter(Boolean).join(' · ') || 'Sin datos de contacto adicionales';
    els.clnNuevoCasoForm.classList.add('hidden');
    const casos = await TC.crm.listarCasosPorCliente(clienteId);
    TC.ui.renderCasos(els.clnListaCasos, casos);
    mostrarPanelClientes('clnDetalleCliente');
  }

  function abrirFormNuevoCaso(tipo) {
    tipoCasoNuevo = tipo;
    els.clnTituloCaso.value = '';
    els.clnNuevoCasoForm.classList.remove('hidden');
  }

  async function guardarCasoNuevo() {
    const titulo = els.clnTituloCaso.value.trim();
    if (!titulo) { alert('Escribe un título para el caso.'); return; }
    const caso = await TC.crm.crearCaso(clienteActualCRM.id, tipoCasoNuevo, titulo);
    els.clnNuevoCasoForm.classList.add('hidden');
    await abrirDetalleCaso(caso.id);
  }

  function onClickListaCasos(e) {
    const fila = e.target.closest('.cln-caso-row');
    if (!fila) return;
    abrirDetalleCaso(fila.dataset.id);
  }

  async function recargarTimeline(casoId) {
    const eventos = await TC.crm.listarEventosPorCaso(casoId);
    for (const url of eventoArchivoUrls.values()) URL.revokeObjectURL(url);
    eventoArchivoUrls = new Map();
    for (const ev of eventos) {
      for (const archivo of (ev.archivos || [])) {
        const url = URL.createObjectURL(archivo.blob);
        eventoArchivoUrls.set(ev.id + '::' + archivo.nombre, url);
        archivo._url = url;
      }
    }
    TC.ui.renderTimeline(els.clnTimeline, eventos);
  }

  async function onCambiarEtapaCaso() {
    if (!casoActualCRM) return;
    casoActualCRM = await TC.crm.cambiarEtapa(casoActualCRM.id, els.clnEtapaCaso.value);
  }

  function onChangeTipoEventoCaso() {
    const tipo = els.clnTipoEvento.value;
    els.clnMontoWrap.classList.toggle('hidden', tipo !== 'pago' && tipo !== 'costo');
    els.clnCotizacionWrap.classList.toggle('hidden', tipo !== 'cotizacion');
  }

  async function abrirDetalleCaso(casoId) {
    casoActualCRM = await TC.crm.obtenerCaso(casoId);
    if (!casoActualCRM) return;
    const cliente = await TC.crm.obtenerCliente(casoActualCRM.clienteId);

    els.clnCasoTitulo.textContent = casoActualCRM.titulo;
    els.clnCasoMeta.textContent =
      `${casoActualCRM.tipo === 'servicio' ? 'Servicio técnico' : 'Venta de producto'} · ${cliente ? cliente.nombre : ''}`;
    TC.ui.llenarSelectEtapas(els.clnEtapaCaso, TC.crm.etapasPara(casoActualCRM.tipo), casoActualCRM.etapaActual);
    els.clnTotalCotizado.textContent = TC.ui.moneda(casoActualCRM.totalCotizado);
    els.clnTotalCobrado.textContent = TC.ui.moneda(casoActualCRM.totalCobrado);
    els.clnTotalCostos.textContent = TC.ui.moneda(casoActualCRM.totalCostos);
    els.clnGarantiaHasta.textContent = casoActualCRM.garantiaVigenteHasta
      ? new Date(casoActualCRM.garantiaVigenteHasta).toLocaleDateString('es-CO') : '—';

    els.clnTipoEvento.value = 'cotizacion';
    els.clnFechaEvento.value = new Date().toISOString().slice(0, 10);
    els.clnMontoEvento.value = '';
    els.clnDescripcionEvento.value = '';
    els.clnArchivosEvento.value = '';
    onChangeTipoEventoCaso();

    const cotizaciones = await TC.db.getCotizaciones();
    els.clnCotizacionEvento.innerHTML = '<option value="">— Ninguna —</option>' +
      cotizaciones.map(c => `<option value="${c.id}">No. ${c.numero} — ${TC.ui.escapeHtml(c.cliente.nombre || '')} — ${TC.ui.moneda(c.total)}</option>`).join('');

    await recargarTimeline(casoId);
    mostrarPanelClientes('clnDetalleCaso');
  }

  function leerArchivos(fileList) {
    return Array.from(fileList).map(file => ({ nombre: file.name, tipo: file.type, blob: file }));
  }

  async function onClickAgregarEvento() {
    if (!casoActualCRM) return;
    const tipo = els.clnTipoEvento.value;
    // Ojo: "YYYY-MM-DD" a secas se interpreta como medianoche UTC, y en zonas
    // horarias negativas (Colombia, UTC-5) eso cae en el día anterior al
    // mostrarlo en local — por eso se ancla a mediodía local, no a la fecha tal cual.
    const fecha = els.clnFechaEvento.value ? new Date(els.clnFechaEvento.value + 'T12:00:00').toISOString() : new Date().toISOString();
    const monto = els.clnMontoEvento.value.trim() !== '' ? parseFloat(els.clnMontoEvento.value) : null;
    const cotizacionId = els.clnCotizacionEvento.value || null;
    const archivos = leerArchivos(els.clnArchivosEvento.files);

    await TC.crm.agregarEvento(casoActualCRM.id, {
      tipo, fecha, descripcion: els.clnDescripcionEvento.value.trim(), archivos, monto, cotizacionId
    });
    await abrirDetalleCaso(casoActualCRM.id);
  }

  async function onClickTimeline(e) {
    const btn = e.target.closest('.evento-eliminar');
    if (!btn) return;
    const fila = e.target.closest('.evento-caso');
    if (!confirm('¿Eliminar este evento de la bitácora?')) return;
    await TC.crm.eliminarEvento(fila.dataset.id, casoActualCRM.id);
    await abrirDetalleCaso(casoActualCRM.id);
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
      filtroSubcategoria: $('filtroSubcategoria'),
      filtroMarca: $('filtroMarca'),
      filtroDisponibilidad: $('filtroDisponibilidad'),
      btnLimpiarFiltros: $('btnLimpiarFiltros'),
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
      cotClienteBuscar: $('cotClienteBuscar'),
      cotClienteSugerencias: $('cotClienteSugerencias'),
      cotClienteVinculadoInfo: $('cotClienteVinculadoInfo'),
      cotClienteVinculadoNombre: $('cotClienteVinculadoNombre'),
      cotClienteQuitarVinculo: $('cotClienteQuitarVinculo'),
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
      btnDescargarPdf: $('btnDescargarPdf'),

      btnClientes: $('btnClientes'),
      modalClientes: $('modalClientes'),
      btnCerrarClientes: $('btnCerrarClientes'),
      clnListado: $('clnListado'),
      clnBuscarCliente: $('clnBuscarCliente'),
      btnNuevoCliente: $('btnNuevoCliente'),
      clnListaClientes: $('clnListaClientes'),
      clnNuevoCliente: $('clnNuevoCliente'),
      clnVolverForm: $('clnVolverForm'),
      clnNombre: $('clnNombre'),
      clnEmpresa: $('clnEmpresa'),
      clnNit: $('clnNit'),
      clnTelefono: $('clnTelefono'),
      clnEmail: $('clnEmail'),
      clnDireccion: $('clnDireccion'),
      clnCiudad: $('clnCiudad'),
      clnNotas: $('clnNotas'),
      btnGuardarCliente: $('btnGuardarCliente'),
      clnDetalleCliente: $('clnDetalleCliente'),
      clnDetalleNombre: $('clnDetalleNombre'),
      clnDetalleMeta: $('clnDetalleMeta'),
      btnEditarCliente: $('btnEditarCliente'),
      btnNuevoCasoProducto: $('btnNuevoCasoProducto'),
      btnNuevoCasoServicio: $('btnNuevoCasoServicio'),
      clnNuevoCasoForm: $('clnNuevoCasoForm'),
      clnTituloCaso: $('clnTituloCaso'),
      btnCancelarCaso: $('btnCancelarCaso'),
      btnGuardarCaso: $('btnGuardarCaso'),
      clnListaCasos: $('clnListaCasos'),
      clnDetalleCaso: $('clnDetalleCaso'),
      clnCasoTitulo: $('clnCasoTitulo'),
      clnCasoMeta: $('clnCasoMeta'),
      clnEtapaCaso: $('clnEtapaCaso'),
      clnTotalCotizado: $('clnTotalCotizado'),
      clnTotalCobrado: $('clnTotalCobrado'),
      clnTotalCostos: $('clnTotalCostos'),
      clnGarantiaHasta: $('clnGarantiaHasta'),
      clnTimeline: $('clnTimeline'),
      clnTipoEvento: $('clnTipoEvento'),
      clnFechaEvento: $('clnFechaEvento'),
      clnMontoWrap: $('clnMontoWrap'),
      clnMontoEvento: $('clnMontoEvento'),
      clnCotizacionWrap: $('clnCotizacionWrap'),
      clnCotizacionEvento: $('clnCotizacionEvento'),
      clnDescripcionEvento: $('clnDescripcionEvento'),
      clnArchivosEvento: $('clnArchivosEvento'),
      btnAgregarEvento: $('btnAgregarEvento')
    };

    TC.importWizard.init(recargarDatos);

    els.inputBuscar.addEventListener('input', debounce(ejecutarBusqueda, 120));
    els.filtroProveedor.addEventListener('change', () => {
      actualizarFiltroCategoria(); actualizarFiltroSubcategoria(); actualizarFiltroMarca(); ejecutarBusqueda();
    });
    els.filtroCategoria.addEventListener('change', () => {
      actualizarFiltroSubcategoria(); actualizarFiltroMarca(); ejecutarBusqueda();
    });
    els.filtroSubcategoria.addEventListener('change', ejecutarBusqueda);
    els.filtroMarca.addEventListener('change', ejecutarBusqueda);
    els.filtroDisponibilidad.addEventListener('change', ejecutarBusqueda);
    els.btnLimpiarFiltros.addEventListener('click', limpiarFiltros);
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
    els.cotClienteBuscar.addEventListener('input', debounce(onInputClienteBuscar, 150));
    els.cotClienteSugerencias.addEventListener('click', onClickClienteSugerencias);
    els.cotClienteQuitarVinculo.addEventListener('click', quitarVinculoCliente);
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

    els.btnClientes.addEventListener('click', abrirClientes);
    els.btnCerrarClientes.addEventListener('click', cerrarClientes);
    els.modalClientes.addEventListener('click', async e => {
      const volver = e.target.closest('.cln-volver');
      if (volver) {
        const destino = volver.dataset.volver;
        if (destino === 'clnListado') TC.ui.renderClientes(els.clnListaClientes, clientesCacheCRM);
        if (destino === 'clnDetalleCliente' && clienteActualCRM) {
          const casos = await TC.crm.listarCasosPorCliente(clienteActualCRM.id);
          TC.ui.renderCasos(els.clnListaCasos, casos);
        }
        mostrarPanelClientes(destino);
        return;
      }
      if (e.target === els.modalClientes) cerrarClientes();
    });
    els.clnBuscarCliente.addEventListener('input', debounce(onInputBuscarClientes, 120));
    els.btnNuevoCliente.addEventListener('click', abrirFormNuevoCliente);
    els.clnListaClientes.addEventListener('click', onClickListaClientes);
    els.btnGuardarCliente.addEventListener('click', guardarCliente);
    els.btnEditarCliente.addEventListener('click', abrirFormEditarCliente);
    els.btnNuevoCasoProducto.addEventListener('click', () => abrirFormNuevoCaso('producto'));
    els.btnNuevoCasoServicio.addEventListener('click', () => abrirFormNuevoCaso('servicio'));
    els.btnCancelarCaso.addEventListener('click', () => els.clnNuevoCasoForm.classList.add('hidden'));
    els.btnGuardarCaso.addEventListener('click', guardarCasoNuevo);
    els.clnListaCasos.addEventListener('click', onClickListaCasos);
    els.clnEtapaCaso.addEventListener('change', onCambiarEtapaCaso);
    els.clnTipoEvento.addEventListener('change', onChangeTipoEventoCaso);
    els.btnAgregarEvento.addEventListener('click', onClickAgregarEvento);
    els.clnTimeline.addEventListener('click', onClickTimeline);
    TC.ui.llenarSelectEtapas(els.clnTipoEvento, TC.crm.tiposEvento(), 'cotizacion');

    actualizarBadgeCotizacion();
    recargarDatos();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
