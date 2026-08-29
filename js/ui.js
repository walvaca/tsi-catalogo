var TC = window.TC || (window.TC = {});

TC.ui = (function () {
  function escapeHtml(s) {
    return (s || '').toString()
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function moneda(n) {
    if (n == null) return '—';
    return '$' + Math.round(n).toLocaleString('es-CO');
  }

  function badgeProveedor(p) {
    const cls = p.proveedor === 'GVS' ? 'badge-gvs' : 'badge-tecnomax';
    return `<span class="badge ${cls}">${escapeHtml(p.proveedor)}</span>`;
  }

  function fotoHtml(p, claseTam) {
    return p._imagenUrl
      ? `<img src="${escapeHtml(p._imagenUrl)}" alt="" loading="lazy">`
      : '<div class="sin-foto">📦</div>';
  }

  function tarjetaProducto(p, opts) {
    opts = opts || {};
    const notaHtml = p.nota ? `<div class="nota">📝 ${escapeHtml(p.nota)}</div>` : '';
    const overrideHtml = p._tieneOverride
      ? `<span class="precio-original">${moneda(p._precioConIVAOriginal)}</span>`
      : '';
    const existenciaHtml = p.agotado
      ? '<span class="badge badge-agotado">Agotado</span>'
      : p.existenciaUnica
        ? '<span class="badge badge-stock">Existencia única</span>' : '';
    const fichaHtml = p.urlFicha
      ? `<a class="btn btn-sec btn-sm" href="${escapeHtml(p.urlFicha)}" target="_blank" rel="noopener">Ver ficha ↗</a>`
      : '';

    return `
    <div class="entry" data-id="${escapeHtml(p.id)}">
      <div class="entry-row">
        <div class="entry-media">${fotoHtml(p)}</div>
        <div class="entry-main">
          <div class="entry-top">
            ${badgeProveedor(p)}
            ${existenciaHtml}
            <span class="codigo">${escapeHtml(p.codigo)}</span>
          </div>
          <div class="desc">${escapeHtml(p.descripcion || '(sin descripción)')}</div>
          <div class="meta">${escapeHtml(p.marca || '—')} · ${escapeHtml(p.categoria || '')}${p.subcategoria ? ' · ' + escapeHtml(p.subcategoria) : ''}</div>
          <div class="precios">
            <div class="precio-con-iva">${moneda(p.precioConIVA)} ${overrideHtml}</div>
            <div class="precio-sin-iva">${moneda(p.precioSinIVA)} sin IVA</div>
          </div>
          ${notaHtml}
        </div>
      </div>
      <div class="entry-actions">
        ${fichaHtml}
        <button class="btn btn-sec btn-sm act-editar">Ajustar precio / nota</button>
        <button class="btn btn-sec btn-sm act-alternativas">Ver alternativas</button>
        <button class="btn btn-sm act-agregar-cotizacion">+ Cotización</button>
      </div>
      <div class="alternativas hidden"></div>
    </div>`;
  }

  function renderResultados(container, productos) {
    if (productos.length === 0) {
      container.innerHTML = '<div class="sin-resultados">Sin resultados. Prueba con otro código, nombre o marca.</div>';
      return;
    }
    container.innerHTML = productos.map(p => tarjetaProducto(p)).join('');
  }

  function renderAlternativas(elAlt, lista) {
    if (lista.length === 0) {
      elAlt.innerHTML = '<div class="sin-resultados">No hay alternativas registradas en el catálogo.</div>';
      return;
    }
    elAlt.innerHTML = '<div class="alt-title">Alternativas</div>' +
      lista.map(p => `
        <div class="alt-row" data-id="${escapeHtml(p.id)}">
          <div class="alt-media">${fotoHtml(p)}</div>
          <span class="codigo">${escapeHtml(p.codigo)}</span>
          <span class="alt-desc">${escapeHtml(p.descripcion)}</span>
          <span class="alt-precio">${moneda(p.precioConIVA)}</span>
        </div>`).join('');
  }

  function renderStats(el, importaciones, totalProductos) {
    if (!importaciones.length) {
      el.innerHTML = '<span class="stat-empty">Todavía no has importado ningún catálogo.</span>';
      return;
    }
    el.innerHTML = importaciones.map(imp => {
      const fecha = imp.fechaProveedor || new Date(imp.fechaImportacionLocal).toLocaleString('es-CO');
      return `<span class="stat-chip"><b>${escapeHtml(imp.proveedor)}</b> ${imp.totalProductos} productos · actualizado ${escapeHtml(fecha)}</span>`;
    }).join('') + `<span class="stat-chip stat-total">${totalProductos} productos en total</span>`;
  }

  function llenarSelect(select, valores, etiquetaTodos) {
    const actual = select.value;
    select.innerHTML = `<option value="">${etiquetaTodos}</option>` +
      valores.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    if (valores.includes(actual)) select.value = actual;
  }

  function cotizacionItemHtml(item) {
    const media = item.imagenUrl
      ? `<img src="${escapeHtml(item.imagenUrl)}" alt="">`
      : '<div class="sin-foto">📦</div>';
    return `
    <div class="cot-item" data-id="${escapeHtml(item.productoId)}">
      <div class="cot-item-media">${media}</div>
      <div class="cot-item-main">
        <span class="codigo">${escapeHtml(item.codigo)}</span>
        <div class="cot-item-desc">${escapeHtml(item.descripcion || '(sin descripción)')}</div>
        <div class="cot-item-fields">
          <div><label>Cant.</label><input type="number" min="1" step="1" class="cot-cantidad" value="${item.cantidad}"></div>
          <div><label>% Util.</label><input type="number" min="0" step="1" class="cot-margen" value="${item.margenPorcentaje != null ? item.margenPorcentaje : ''}"></div>
          <div><label>Precio venta</label><input type="number" min="0" step="1" class="cot-precio" value="${item.precioVenta != null ? item.precioVenta : ''}"></div>
        </div>
      </div>
      <div class="cot-item-subtotal">${moneda(item.subtotal)}</div>
      <button class="cot-item-quitar" title="Quitar">✕</button>
    </div>`;
  }

  function renderCotizacionItems(container, items) {
    container.innerHTML = items.map(cotizacionItemHtml).join('');
  }

  function renderHistorial(container, cotizaciones) {
    if (!cotizaciones.length) {
      container.innerHTML = '<div class="sin-resultados">Todavía no has generado ninguna cotización.</div>';
      return;
    }
    container.innerHTML = cotizaciones.map(c => `
      <div class="hist-row" data-id="${escapeHtml(c.id)}">
        <div class="hist-row-info">
          <b>Cotización No. ${c.numero} — ${escapeHtml(c.cliente.nombre || 'Sin nombre')}</b>
          <span>${new Date(c.fecha).toLocaleDateString('es-CO')} · ${c.items.length} producto(s) · ${moneda(c.total)}</span>
        </div>
        <button class="btn btn-sec btn-sm hist-reenviar">Reenviar PDF</button>
      </div>`).join('');
  }

  return {
    escapeHtml, moneda, renderResultados, renderAlternativas, renderStats, llenarSelect,
    tarjetaProducto, renderCotizacionItems, renderHistorial
  };
})();
