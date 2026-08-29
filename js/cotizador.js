/* Borrador de la cotización en curso. Vive en localStorage (JSON simple, pocos
   ítems, no necesita transacciones) — el historial ya generado y la config
   del negocio sí van a IndexedDB (ver js/db.js). "Utilidad" = markup sobre el
   costo del proveedor: precioVenta = costo × (1 + %/100). Si el costo es nulo
   (producto agotado/consultar), no hay de dónde calcular, así que el ítem
   arranca con precioVenta en null y el usuario lo escribe a mano. */
var TC = window.TC || (window.TC = {});

TC.cotizador = (function () {
  const CLAVE_BORRADOR = 'tsiCatalogoCotizacionDraft';
  const CLAVE_UTILIDAD = 'tsiCatalogoUtilidadGlobal';

  function cargar() {
    try {
      const crudo = localStorage.getItem(CLAVE_BORRADOR);
      return crudo ? JSON.parse(crudo) : vacio();
    } catch (e) {
      return vacio();
    }
  }

  function vacio() {
    return {
      cliente: { nombre: '', telefono: '', empresa: '', nit: '', direccion: '', ciudadEntrega: 'local' },
      items: []
    };
  }

  function guardar(borrador) {
    localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(borrador));
  }

  function utilidadGlobal() {
    const v = parseFloat(localStorage.getItem(CLAVE_UTILIDAD));
    return isNaN(v) ? 20 : v;
  }

  function setUtilidadGlobal(pct) {
    localStorage.setItem(CLAVE_UTILIDAD, String(pct));
  }

  function redondear(n) {
    return Math.round(n * 100) / 100;
  }

  function calcularPrecioVenta(costo, margenPorcentaje) {
    if (costo == null) return null;
    return redondear(costo * (1 + (margenPorcentaje || 0) / 100));
  }

  function agregar(producto) {
    const borrador = cargar();
    const existente = borrador.items.find(i => i.productoId === producto.id);
    if (existente) {
      existente.cantidad += 1;
    } else {
      const margen = utilidadGlobal();
      const costo = producto.precioConIVA;
      borrador.items.push({
        productoId: producto.id,
        proveedor: producto.proveedor,
        codigo: producto.codigo,
        descripcion: producto.descripcion,
        marca: producto.marca,
        imagenUrl: producto._imagenUrl || null,
        cantidad: 1,
        precioProveedor: costo,
        margenPorcentaje: margen,
        precioVenta: calcularPrecioVenta(costo, margen)
      });
    }
    guardar(borrador);
    return borrador;
  }

  function quitar(productoId) {
    const borrador = cargar();
    borrador.items = borrador.items.filter(i => i.productoId !== productoId);
    guardar(borrador);
    return borrador;
  }

  function actualizarItem(productoId, campos) {
    const borrador = cargar();
    const item = borrador.items.find(i => i.productoId === productoId);
    if (!item) return borrador;

    if (campos.cantidad != null) item.cantidad = Math.max(1, campos.cantidad);
    if (campos.margenPorcentaje != null) {
      item.margenPorcentaje = campos.margenPorcentaje;
      item.precioVenta = calcularPrecioVenta(item.precioProveedor, item.margenPorcentaje);
    }
    if (campos.precioVenta != null) {
      item.precioVenta = redondear(campos.precioVenta);
      // el precio manual manda; el % queda como referencia de cuánto quedó
      item.margenPorcentaje = item.precioProveedor
        ? redondear((item.precioVenta / item.precioProveedor - 1) * 100)
        : item.margenPorcentaje;
    }
    guardar(borrador);
    return borrador;
  }

  function aplicarUtilidadATodos(pct) {
    const borrador = cargar();
    setUtilidadGlobal(pct);
    borrador.items.forEach(item => {
      item.margenPorcentaje = pct;
      item.precioVenta = calcularPrecioVenta(item.precioProveedor, pct);
    });
    guardar(borrador);
    return borrador;
  }

  function actualizarCliente(campos) {
    const borrador = cargar();
    Object.assign(borrador.cliente, campos);
    guardar(borrador);
    return borrador;
  }

  function vaciar() {
    guardar(vacio());
    return vacio();
  }

  function calcularTotales(borrador) {
    let total = 0;
    const items = borrador.items.map(item => {
      const subtotal = item.precioVenta != null ? redondear(item.precioVenta * item.cantidad) : 0;
      total += subtotal;
      return Object.assign({}, item, { subtotal });
    });
    return { items, total: redondear(total) };
  }

  async function finalizar(cliente) {
    const borrador = cargar();
    borrador.cliente = Object.assign({}, borrador.cliente, cliente);
    guardar(borrador);

    const { items, total } = calcularTotales(borrador);
    const cfg = await TC.db.getConfigNegocio();
    const numero = cfg.siguienteNumero || 1;
    await TC.db.putConfigNegocio(Object.assign({}, cfg, { siguienteNumero: numero + 1 }));

    return {
      id: `cot-${Date.now()}`,
      numero,
      fecha: new Date().toISOString(),
      cliente: borrador.cliente,
      utilidadGlobalPorcentaje: utilidadGlobal(),
      items,
      total
    };
  }

  return {
    cargar, guardar, agregar, quitar, actualizarItem, actualizarCliente,
    aplicarUtilidadATodos, vaciar, calcularTotales, finalizar,
    utilidadGlobal, setUtilidadGlobal
  };
})();
