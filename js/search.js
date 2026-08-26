/* Fusión de productos importados + overrides, buscador en memoria y
   cálculo de "alternativas". Con unos pocos miles de productos un filtro
   lineal es instantáneo — no hace falta índice invertido. */
var TC = window.TC || (window.TC = {});

TC.search = (function () {
  const RE_DIACRITICOS = new RegExp('[̀-ͯ]', 'g');
  function normalizar(s) {
    return (s || '')
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(RE_DIACRITICOS, '');
  }

  function fusionar(productos, overridesMap) {
    return productos.map(p => {
      const ov = overridesMap.get(p.id);
      if (!ov) return Object.assign({ _tieneOverride: false }, p);
      return Object.assign({}, p, {
        _tieneOverride: true,
        _precioSinIVAOriginal: p.precioSinIVA,
        _precioConIVAOriginal: p.precioConIVA,
        precioSinIVA: ov.precioSinIVAOverride != null ? ov.precioSinIVAOverride : p.precioSinIVA,
        precioConIVA: ov.precioConIVAOverride != null ? ov.precioConIVAOverride : p.precioConIVA,
        nota: ov.nota || null
      });
    });
  }

  function indexarTexto(p) {
    return normalizar([p.codigo, p.descripcion, p.marca, p.categoria, p.subcategoria].join(' '));
  }

  function construirIndice(catalogoFusionado) {
    return catalogoFusionado.map(p => ({ p, texto: indexarTexto(p) }));
  }

  function buscar(indice, query, filtros) {
    filtros = filtros || {};
    const q = normalizar(query).trim();
    const terminos = q.split(/\s+/).filter(Boolean);

    let resultados = indice;
    if (filtros.proveedor) resultados = resultados.filter(e => e.p.proveedor === filtros.proveedor);
    if (filtros.categoria) resultados = resultados.filter(e => e.p.categoria === filtros.categoria);

    if (terminos.length === 0) {
      return resultados.map(e => e.p).slice(0, 200);
    }

    resultados = resultados.filter(e => terminos.every(t => e.texto.includes(t)));

    resultados.sort((a, b) => {
      const codA = normalizar(a.p.codigo);
      const codB = normalizar(b.p.codigo);
      const aExact = codA === q, bExact = codB === q;
      if (aExact !== bExact) return aExact ? -1 : 1;
      const aPref = codA.startsWith(q), bPref = codB.startsWith(q);
      if (aPref !== bPref) return aPref ? -1 : 1;
      return 0;
    });

    return resultados.slice(0, 200).map(e => e.p);
  }

  function alternativas(catalogoFusionado, producto, limite) {
    limite = limite || 6;
    const mismoProveedor = catalogoFusionado.filter(p => p.proveedor === producto.proveedor && p.id !== producto.id);

    let tier1 = mismoProveedor.filter(p => p.subcategoria && p.subcategoria === producto.subcategoria);
    if (tier1.length >= 3) return tier1.slice(0, limite);

    let tier2 = mismoProveedor.filter(p => p.categoria === producto.categoria);
    const combinados = tier1.concat(tier2.filter(p => !tier1.includes(p)));
    return combinados.slice(0, limite);
  }

  function categoriasDisponibles(catalogoFusionado, proveedor) {
    const set = new Set();
    for (const p of catalogoFusionado) {
      if (proveedor && p.proveedor !== proveedor) continue;
      if (p.categoria) set.add(p.categoria);
    }
    return Array.from(set).sort();
  }

  return { normalizar, fusionar, construirIndice, buscar, alternativas, categoriasDisponibles };
})();
