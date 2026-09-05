/* Capa de persistencia (IndexedDB). Todo el catálogo vive en el dispositivo,
   sin backend — igual de local que tsi-vault, pero en IndexedDB en vez de
   localStorage porque acá se reimportan miles de filas de golpe. */
var TC = window.TC || (window.TC = {});

TC.db = (function () {
  const DB_NAME = 'tsiCatalogoDB';
  const DB_VERSION = 4;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('productos')) {
          const store = db.createObjectStore('productos', { keyPath: 'id' });
          store.createIndex('proveedor', 'proveedor', { unique: false });
          store.createIndex('categoria', 'categoria', { unique: false });
          store.createIndex('subcategoria', 'subcategoria', { unique: false });
        }
        if (!db.objectStoreNames.contains('overrides')) {
          db.createObjectStore('overrides', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('importaciones')) {
          db.createObjectStore('importaciones', { keyPath: 'proveedor' });
        }
        if (!db.objectStoreNames.contains('perfilesImportacion')) {
          db.createObjectStore('perfilesImportacion', { keyPath: 'proveedor' });
        }
        if (!db.objectStoreNames.contains('imagenes')) {
          const store = db.createObjectStore('imagenes', { keyPath: 'id' });
          store.createIndex('proveedor', 'proveedor', { unique: false });
        }
        if (!db.objectStoreNames.contains('cotizaciones')) {
          db.createObjectStore('cotizaciones', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('configuracion')) {
          db.createObjectStore('configuracion', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('clientes')) {
          db.createObjectStore('clientes', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('casos')) {
          const store = db.createObjectStore('casos', { keyPath: 'id' });
          store.createIndex('clienteId', 'clienteId', { unique: false });
        }
        if (!db.objectStoreNames.contains('eventosCaso')) {
          const store = db.createObjectStore('eventosCaso', { keyPath: 'id' });
          store.createIndex('casoId', 'casoId', { unique: false });
          store.createIndex('fecha', 'fecha', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function tx(storeNames, mode) {
    return open().then(db => db.transaction(storeNames, mode));
  }

  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function txDone(t) {
    return new Promise((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  function borrarPorProveedor(store, proveedor) {
    return new Promise((resolve, reject) => {
      const cursorReq = store.index('proveedor').openCursor(IDBKeyRange.only(proveedor));
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) { cursor.delete(); cursor.continue(); }
        else resolve();
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
  }

  async function replaceProductos(proveedor, productos) {
    const t = await tx('productos', 'readwrite');
    const store = t.objectStore('productos');
    await borrarPorProveedor(store, proveedor);
    for (const p of productos) store.put(p);
    return txDone(t);
  }

  async function replaceImagenes(proveedor, imagenes) {
    const t = await tx('imagenes', 'readwrite');
    const store = t.objectStore('imagenes');
    await borrarPorProveedor(store, proveedor);
    for (const img of imagenes) store.put(img);
    return txDone(t);
  }

  async function getAllImagenes() {
    const t = await tx('imagenes', 'readonly');
    return reqToPromise(t.objectStore('imagenes').getAll());
  }

  async function getAllProductos() {
    const t = await tx('productos', 'readonly');
    return reqToPromise(t.objectStore('productos').getAll());
  }

  async function getAllOverrides() {
    const t = await tx('overrides', 'readonly');
    const rows = await reqToPromise(t.objectStore('overrides').getAll());
    const map = new Map();
    for (const r of rows) map.set(r.id, r);
    return map;
  }

  async function putOverride(override) {
    const t = await tx('overrides', 'readwrite');
    t.objectStore('overrides').put(override);
    return txDone(t);
  }

  async function deleteOverride(id) {
    const t = await tx('overrides', 'readwrite');
    t.objectStore('overrides').delete(id);
    return txDone(t);
  }

  async function putImportacion(record) {
    const t = await tx('importaciones', 'readwrite');
    t.objectStore('importaciones').put(record);
    return txDone(t);
  }

  async function getImportaciones() {
    const t = await tx('importaciones', 'readonly');
    return reqToPromise(t.objectStore('importaciones').getAll());
  }

  async function getPerfil(proveedor) {
    const t = await tx('perfilesImportacion', 'readonly');
    return reqToPromise(t.objectStore('perfilesImportacion').get(proveedor));
  }

  async function putPerfil(perfil) {
    const t = await tx('perfilesImportacion', 'readwrite');
    t.objectStore('perfilesImportacion').put(perfil);
    return txDone(t);
  }

  // Datos reales de la empresa (tarjeta de presentación / portafolio de servicios
  // 2026) — se usan como valor por defecto mientras el usuario no configure los suyos,
  // así la primera cotización ya sale con membrete correcto.
  const NEGOCIO_POR_DEFECTO = {
    id: 'negocio',
    nombreNegocio: 'TSI — Technology & Security Intelligence S.A.S.',
    nit: '902.058.899-6',
    telefono: '+57 310 756 7232',
    logoBlob: null,
    siguienteNumero: 1
  };

  async function getConfigNegocio() {
    const t = await tx('configuracion', 'readonly');
    const cfg = await reqToPromise(t.objectStore('configuracion').get('negocio'));
    return cfg || Object.assign({}, NEGOCIO_POR_DEFECTO);
  }

  async function putConfigNegocio(cfg) {
    const t = await tx('configuracion', 'readwrite');
    t.objectStore('configuracion').put(Object.assign({ id: 'negocio' }, cfg));
    return txDone(t);
  }

  async function putCotizacion(cot) {
    const t = await tx('cotizaciones', 'readwrite');
    t.objectStore('cotizaciones').put(cot);
    return txDone(t);
  }

  async function getCotizaciones() {
    const t = await tx('cotizaciones', 'readonly');
    const rows = await reqToPromise(t.objectStore('cotizaciones').getAll());
    return rows.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  }

  async function getCotizacion(id) {
    const t = await tx('cotizaciones', 'readonly');
    return reqToPromise(t.objectStore('cotizaciones').get(id));
  }

  // ===== CRM: clientes, casos y bitácora de eventos =====

  async function getAllClientes() {
    const t = await tx('clientes', 'readonly');
    return reqToPromise(t.objectStore('clientes').getAll());
  }

  async function getCliente(id) {
    const t = await tx('clientes', 'readonly');
    return reqToPromise(t.objectStore('clientes').get(id));
  }

  async function putCliente(cliente) {
    const t = await tx('clientes', 'readwrite');
    t.objectStore('clientes').put(cliente);
    return txDone(t);
  }

  async function getCasosPorCliente(clienteId) {
    const t = await tx('casos', 'readonly');
    return reqToPromise(t.objectStore('casos').index('clienteId').getAll(clienteId));
  }

  async function getCaso(id) {
    const t = await tx('casos', 'readonly');
    return reqToPromise(t.objectStore('casos').get(id));
  }

  async function putCaso(caso) {
    const t = await tx('casos', 'readwrite');
    t.objectStore('casos').put(caso);
    return txDone(t);
  }

  async function getEventosPorCaso(casoId) {
    const t = await tx('eventosCaso', 'readonly');
    const rows = await reqToPromise(t.objectStore('eventosCaso').index('casoId').getAll(casoId));
    return rows.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  }

  async function putEvento(evento) {
    const t = await tx('eventosCaso', 'readwrite');
    t.objectStore('eventosCaso').put(evento);
    return txDone(t);
  }

  async function deleteEvento(id) {
    const t = await tx('eventosCaso', 'readwrite');
    t.objectStore('eventosCaso').delete(id);
    return txDone(t);
  }

  return {
    open, replaceProductos, getAllProductos, getAllOverrides,
    putOverride, deleteOverride, putImportacion, getImportaciones,
    getPerfil, putPerfil, replaceImagenes, getAllImagenes,
    getConfigNegocio, putConfigNegocio, putCotizacion, getCotizaciones, getCotizacion,
    getAllClientes, getCliente, putCliente,
    getCasosPorCliente, getCaso, putCaso,
    getEventosPorCaso, putEvento, deleteEvento
  };
})();
