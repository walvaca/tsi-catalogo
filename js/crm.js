/* Lógica de clientes, casos (venta de producto / servicio técnico) y su
   bitácora de eventos. Sin DOM, igual que cotizador.js — solo datos.
   Un cliente puede tener varios "casos"; cada caso tiene una etapa actual
   (de una lista fija según su tipo) y una bitácora de eventos (cotización,
   propuesta, diagnóstico, recepción de equipo, servicio técnico, entrega,
   pago, costo, nota) que puede traer archivos adjuntos (fotos, PDFs).
   Cambiar de etapa NO agrega un evento automático — son dos cosas separadas
   a propósito: la etapa es "dónde va el caso", los eventos son "qué se hizo
   o se adjuntó". */
var TC = window.TC || (window.TC = {});

TC.crm = (function () {
  const ETAPAS_PRODUCTO = [
    { id: 'cotizacion', label: 'Cotización' },
    { id: 'propuesta', label: 'Propuesta enviada' },
    { id: 'pedido', label: 'Pedido confirmado' },
    { id: 'entrega', label: 'Entrega' },
    { id: 'garantia', label: 'En garantía' },
    { id: 'cerrado', label: 'Cerrado' }
  ];

  const ETAPAS_SERVICIO = [
    { id: 'cotizacion', label: 'Cotización' },
    { id: 'diagnostico', label: 'Diagnóstico' },
    { id: 'servicio_tecnico', label: 'Servicio técnico' },
    { id: 'entrega', label: 'Entrega' },
    { id: 'garantia', label: 'En garantía' },
    { id: 'cerrado', label: 'Cerrado' }
  ];

  const TIPOS_EVENTO = [
    { id: 'cotizacion', label: 'Cotización' },
    { id: 'propuesta', label: 'Propuesta' },
    { id: 'diagnostico', label: 'Diagnóstico' },
    { id: 'recepcion_equipo', label: 'Recepción de equipo' },
    { id: 'servicio_tecnico', label: 'Servicio técnico realizado' },
    { id: 'entrega', label: 'Entrega' },
    { id: 'pago', label: 'Pago recibido' },
    { id: 'costo', label: 'Costo / gasto' },
    { id: 'nota', label: 'Nota' }
  ];

  const GARANTIA_MESES_DEFECTO = 12;

  function etapasPara(tipo) {
    return tipo === 'servicio' ? ETAPAS_SERVICIO : ETAPAS_PRODUCTO;
  }

  function etiquetaEtapa(tipo, etapaId) {
    const etapa = etapasPara(tipo).find(e => e.id === etapaId);
    return etapa ? etapa.label : etapaId;
  }

  function tiposEvento() {
    return TIPOS_EVENTO;
  }

  function etiquetaTipoEvento(tipoId) {
    const t = TIPOS_EVENTO.find(e => e.id === tipoId);
    return t ? t.label : tipoId;
  }

  // ===== Clientes =====

  async function crearCliente(datos) {
    const ahora = new Date().toISOString();
    const cliente = Object.assign({
      id: `cli-${Date.now()}`,
      nombre: '', empresa: '', nit: '', telefono: '', email: '',
      direccion: '', ciudad: '', notas: '',
      creadoEn: ahora, actualizadoEn: ahora
    }, datos);
    await TC.db.putCliente(cliente);
    return cliente;
  }

  async function actualizarCliente(id, datos) {
    const cliente = await TC.db.getCliente(id);
    if (!cliente) return null;
    const actualizado = Object.assign({}, cliente, datos, {
      id, actualizadoEn: new Date().toISOString()
    });
    await TC.db.putCliente(actualizado);
    return actualizado;
  }

  async function listarClientes() {
    const clientes = await TC.db.getAllClientes();
    return clientes.sort((a, b) => TC.search.normalizar(a.nombre).localeCompare(TC.search.normalizar(b.nombre)));
  }

  function obtenerCliente(id) {
    return TC.db.getCliente(id);
  }

  function filtrarClientes(clientes, query) {
    const q = TC.search.normalizar(query).trim();
    if (!q) return clientes;
    return clientes.filter(c => {
      const texto = TC.search.normalizar([c.nombre, c.empresa, c.telefono, c.nit].join(' '));
      return texto.includes(q);
    });
  }

  // ===== Casos =====

  async function crearCaso(clienteId, tipo, titulo) {
    const ahora = new Date().toISOString();
    const caso = {
      id: `caso-${Date.now()}`,
      clienteId, tipo, titulo,
      etapaActual: etapasPara(tipo)[0].id,
      garantiaMeses: GARANTIA_MESES_DEFECTO,
      garantiaVigenteHasta: null,
      fechaCreacion: ahora, fechaCierre: null,
      totalCotizado: 0, totalCobrado: 0, totalCostos: 0,
      notas: '',
      creadoEn: ahora, actualizadoEn: ahora
    };
    await TC.db.putCaso(caso);
    return caso;
  }

  async function listarCasosPorCliente(clienteId) {
    const casos = await TC.db.getCasosPorCliente(clienteId);
    return casos.sort((a, b) => (a.fechaCreacion < b.fechaCreacion ? 1 : -1));
  }

  function obtenerCaso(id) {
    return TC.db.getCaso(id);
  }

  function calcularGarantiaVigenteHasta(fechaBase, meses) {
    const fecha = new Date(fechaBase);
    fecha.setMonth(fecha.getMonth() + (meses || 0));
    return fecha.toISOString();
  }

  async function cambiarEtapa(casoId, nuevaEtapaId) {
    const caso = await TC.db.getCaso(casoId);
    if (!caso) return null;
    const valida = etapasPara(caso.tipo).some(e => e.id === nuevaEtapaId);
    if (!valida) throw new Error(`Etapa "${nuevaEtapaId}" no aplica al tipo "${caso.tipo}"`);

    caso.etapaActual = nuevaEtapaId;
    caso.fechaCierre = nuevaEtapaId === 'cerrado' ? new Date().toISOString() : null;
    caso.actualizadoEn = new Date().toISOString();
    await TC.db.putCaso(caso);
    return caso;
  }

  async function recalcularRollups(casoId) {
    const [caso, eventos] = await Promise.all([TC.db.getCaso(casoId), TC.db.getEventosPorCaso(casoId)]);
    if (!caso) return null;

    let totalCobrado = 0, totalCostos = 0;
    for (const ev of eventos) {
      if (ev.tipo === 'pago' && ev.monto) totalCobrado += ev.monto;
      if (ev.tipo === 'costo' && ev.monto) totalCostos += ev.monto;
    }
    caso.totalCobrado = totalCobrado;
    caso.totalCostos = totalCostos;
    caso.actualizadoEn = new Date().toISOString();
    await TC.db.putCaso(caso);
    return caso;
  }

  // ===== Eventos =====

  async function agregarEvento(casoId, datos) {
    const caso = await TC.db.getCaso(casoId);
    if (!caso) throw new Error('Caso no encontrado');

    const evento = {
      id: `evt-${Date.now()}`,
      casoId,
      tipo: datos.tipo,
      fecha: datos.fecha || new Date().toISOString(),
      descripcion: datos.descripcion || '',
      archivos: datos.archivos || [],
      monto: datos.monto != null ? datos.monto : null,
      cotizacionId: datos.cotizacionId || null,
      creadoEn: new Date().toISOString()
    };
    await TC.db.putEvento(evento);

    if (evento.tipo === 'entrega') {
      caso.garantiaVigenteHasta = calcularGarantiaVigenteHasta(evento.fecha, caso.garantiaMeses);
      caso.actualizadoEn = new Date().toISOString();
      await TC.db.putCaso(caso);
    }
    if (evento.cotizacionId) {
      const cot = await TC.db.getCotizacion(evento.cotizacionId);
      if (cot) {
        caso.totalCotizado = cot.total;
        caso.actualizadoEn = new Date().toISOString();
        await TC.db.putCaso(caso);
      }
    }
    if (evento.tipo === 'pago' || evento.tipo === 'costo') {
      await recalcularRollups(casoId);
    }

    return evento;
  }

  async function eliminarEvento(id, casoId) {
    await TC.db.deleteEvento(id);
    return recalcularRollups(casoId);
  }

  async function listarEventosPorCaso(casoId) {
    return TC.db.getEventosPorCaso(casoId);
  }

  return {
    etapasPara, etiquetaEtapa, tiposEvento, etiquetaTipoEvento,
    crearCliente, actualizarCliente, listarClientes, obtenerCliente, filtrarClientes,
    crearCaso, listarCasosPorCliente, obtenerCaso, cambiarEtapa,
    agregarEvento, eliminarEvento, listarEventosPorCaso,
    calcularGarantiaVigenteHasta
  };
})();
