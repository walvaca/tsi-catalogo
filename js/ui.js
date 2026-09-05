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
        <button class="btn btn-sm act-agregar-cotizacion">🛒 Agregar a cotización</button>
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

  function llenarSelectEtapas(select, etapas, etapaActualId) {
    select.innerHTML = etapas.map(e => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.label)}</option>`).join('');
    select.value = etapaActualId;
  }

  function tarjetaCliente(c) {
    return `
    <div class="entry cln-cliente-row" data-id="${escapeHtml(c.id)}">
      <div class="desc">${escapeHtml(c.nombre || '(sin nombre)')}</div>
      <div class="meta">${escapeHtml(c.empresa || '—')} · ${escapeHtml(c.telefono || 'sin teléfono')}</div>
    </div>`;
  }

  function renderClientes(container, clientes) {
    if (!clientes.length) {
      container.innerHTML = '<div class="sin-resultados">Todavía no tienes clientes guardados.</div>';
      return;
    }
    container.innerHTML = clientes.map(tarjetaCliente).join('');
  }

  function renderSugerenciasCliente(container, clientes) {
    container.innerHTML = clientes.slice(0, 8).map(c => `
      <div class="sugerencia-cliente" data-id="${escapeHtml(c.id)}">
        <b>${escapeHtml(c.nombre || '(sin nombre)')}</b>
        <span>${escapeHtml(c.empresa || '')} ${c.telefono ? '· ' + escapeHtml(c.telefono) : ''}</span>
      </div>`).join('');
  }

  function tarjetaCaso(caso) {
    const claseBadge = caso.tipo === 'servicio' ? 'badge-servicio' : 'badge-producto';
    const etiquetaTipo = caso.tipo === 'servicio' ? 'Servicio técnico' : 'Venta de producto';
    return `
    <div class="entry cln-caso-row" data-id="${escapeHtml(caso.id)}">
      <div class="entry-top">
        <span class="badge ${claseBadge}">${etiquetaTipo}</span>
        <span class="codigo">${escapeHtml(TC.crm.etiquetaEtapa(caso.tipo, caso.etapaActual))}</span>
      </div>
      <div class="desc">${escapeHtml(caso.titulo || '(sin título)')}</div>
      <div class="meta">Creado ${new Date(caso.fechaCreacion).toLocaleDateString('es-CO')}</div>
    </div>`;
  }

  function renderCasos(container, casos) {
    if (!casos.length) {
      container.innerHTML = '<div class="sin-resultados">Este cliente todavía no tiene casos.</div>';
      return;
    }
    container.innerHTML = casos.map(tarjetaCaso).join('');
  }

  function tarjetaEvento(evento) {
    const archivosHtml = (evento.archivos || []).map(a => a._url
      ? (a.tipo && a.tipo.startsWith('image/')
          ? `<img src="${escapeHtml(a._url)}" alt="${escapeHtml(a.nombre)}" class="evento-foto">`
          : `<a href="${escapeHtml(a._url)}" target="_blank" rel="noopener" class="evento-archivo">📄 ${escapeHtml(a.nombre)}</a>`)
      : '').join('');
    const montoHtml = evento.monto != null
      ? `<span class="evento-monto">${evento.tipo === 'costo' ? '-' : '+'}${moneda(evento.monto)}</span>` : '';
    return `
    <div class="evento-caso" data-id="${escapeHtml(evento.id)}">
      <div class="evento-caso-top">
        <b>${escapeHtml(TC.crm.etiquetaTipoEvento(evento.tipo))}</b>
        <span>${new Date(evento.fecha).toLocaleDateString('es-CO')}</span>
        ${montoHtml}
        <button class="evento-eliminar" title="Eliminar">✕</button>
      </div>
      ${evento.descripcion ? `<div class="evento-desc">${escapeHtml(evento.descripcion)}</div>` : ''}
      ${archivosHtml ? `<div class="evento-archivos">${archivosHtml}</div>` : ''}
    </div>`;
  }

  function renderTimeline(container, eventos) {
    if (!eventos.length) {
      container.innerHTML = '<div class="sin-resultados">Todavía no hay eventos en este caso.</div>';
      return;
    }
    container.innerHTML = eventos.map(tarjetaEvento).join('');
  }

  function filaActividad(ev) {
    const montoHtml = ev.monto != null
      ? `<span class="evento-monto">${ev.tipo === 'costo' ? '-' : '+'}${moneda(ev.monto)}</span>` : '';
    return `
    <div class="evento-caso fila-clickeable" data-caso-id="${escapeHtml(ev.casoId)}" data-cliente-id="${escapeHtml(ev.clienteId || '')}">
      <div class="evento-caso-top">
        <b>${escapeHtml(TC.crm.etiquetaTipoEvento(ev.tipo))}</b>
        <span>${new Date(ev.fecha).toLocaleDateString('es-CO')}</span>
        ${montoHtml}
      </div>
      <div class="evento-desc">${escapeHtml(ev.clienteNombre || '(cliente eliminado)')} · ${escapeHtml(ev.casoTitulo || '')}</div>
      ${ev.descripcion ? `<div class="evento-desc">${escapeHtml(ev.descripcion)}</div>` : ''}
    </div>`;
  }

  function renderActividad(container, eventos) {
    if (!eventos.length) {
      container.innerHTML = '<div class="sin-resultados">No hay actividad en este rango de fechas.</div>';
      return;
    }
    container.innerHTML = eventos.map(filaActividad).join('');
  }

  function filaGarantia(caso) {
    const claseBadge = 'badge-garantia-' + (caso.estado === 'por_vencer' ? 'por-vencer' : caso.estado);
    const etiqueta = caso.estado === 'vencida' ? 'Vencida' : caso.estado === 'por_vencer' ? 'Por vencer' : 'Vigente';
    return `
    <div class="evento-caso fila-clickeable" data-caso-id="${escapeHtml(caso.id)}" data-cliente-id="${escapeHtml(caso.clienteId)}">
      <div class="evento-caso-top">
        <b>${escapeHtml(caso.clienteNombre || '(cliente eliminado)')} · ${escapeHtml(caso.titulo || '')}</b>
        <span class="badge ${claseBadge}">${etiqueta}</span>
      </div>
      <div class="evento-desc">Hasta ${new Date(caso.garantiaVigenteHasta).toLocaleDateString('es-CO')}</div>
    </div>`;
  }

  function renderGarantias(container, casos) {
    if (!casos.length) {
      container.innerHTML = '<div class="sin-resultados">Todavía no hay casos con garantía registrada.</div>';
      return;
    }
    container.innerHTML = casos.map(filaGarantia).join('');
  }

  function renderResumenFinanciero(container, resumen) {
    container.innerHTML = `
      <div>Ingresos<b>${moneda(resumen.ingresos)}</b></div>
      <div>Costos<b>${moneda(resumen.costos)}</b></div>
      <div>Utilidad<b>${moneda(resumen.utilidad)}</b></div>
      <div>Producto (ing./cost.)<b>${moneda(resumen.porTipo.producto.ingresos)} / ${moneda(resumen.porTipo.producto.costos)}</b></div>
      <div>Servicio (ing./cost.)<b>${moneda(resumen.porTipo.servicio.ingresos)} / ${moneda(resumen.porTipo.servicio.costos)}</b></div>`;
  }

  return {
    escapeHtml, moneda, renderResultados, renderAlternativas, renderStats, llenarSelect,
    tarjetaProducto, renderCotizacionItems, renderHistorial,
    llenarSelectEtapas, renderClientes, renderSugerenciasCliente, renderCasos, renderTimeline,
    renderActividad, renderGarantias, renderResumenFinanciero
  };
})();
