/* Capa de persistencia (IndexedDB). Todo el catálogo vive en el dispositivo,
   sin backend — igual de local que tsi-vault, pero en IndexedDB en vez de
   localStorage porque acá se reimportan miles de filas de golpe. */
var TC = window.TC || (window.TC = {});

TC.db = (function () {
  const DB_NAME = 'tsiCatalogoDB';
  const DB_VERSION = 2;
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

  return {
    open, replaceProductos, getAllProductos, getAllOverrides,
    putOverride, deleteOverride, putImportacion, getImportaciones,
    getPerfil, putPerfil, replaceImagenes, getAllImagenes
  };
})();
