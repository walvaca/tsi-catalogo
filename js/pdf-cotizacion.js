/* Arma el PDF de una cotización con jsPDF + jspdf-autotable (vendorizados en
   vendor/, sin CDN). Todo pasa en el navegador, nada se sube a ningún lado —
   el PDF resultante es un Blob que la app decide si comparte (navigator.share)
   o descarga.

   Diseño tipo "documento ejecutivo" (referencia que el usuario aprobó):
   encabezado simple con logo + nombre, línea divisoria, tabla de datos del
   cliente en formato de ficha, tabla de ítems, tabla de totales, sección de
   alcance/condiciones con los términos reales de TSI, tabla de forma de pago
   y validez, y pie de página centrado con el portafolio de servicios. El IVA
   que se muestra es un desglose informativo del mismo total ya calculado
   (costo + utilidad) — no se suma nada encima. */
var TC = window.TC || (window.TC = {});

TC.pdfCotizacion = (function () {
  const COLOR_NAVY = [13, 20, 33];        // #0d1421
  const COLOR_NAVY_FILL = [232, 236, 244]; // fondo claro para celdas de etiqueta
  const COLOR_GRAY = [90, 90, 90];
  const COLOR_LIGHT_GRAY = [140, 140, 140];
  const IVA_PORCENTAJE = 19;
  const MARGEN = 15;

  const SUBTITULO = 'SOLUCIONES INTEGRALES EN SEGURIDAD ELECTRÓNICA Y TECNOLOGÍA';
  const SERVICIOS = 'Venta de equipos  •  CCTV + IA  •  Control de acceso  •  Alarmas  •  Redes  •  Soporte técnico';
  const CONTACTO = 'WhatsApp: 310 756 7232  ·  Bogotá y Cundinamarca';
  const DISCLAIMER = 'Documento comercial TSI · Precios sujetos a disponibilidad y cambios sin previo aviso.';

  const CONDICIONES = [
    'Valores expresados en pesos colombianos (COP). El IVA mostrado es informativo, ya incluido en el precio unitario.',
    'Los precios de los equipos dependen de la lista vigente del proveedor y pueden cambiar sin previo aviso.',
    'Garantía de 12 meses en equipos y mano de obra, salvo condición distinta del fabricante.',
    'La instalación (si aplica) se coordina y cotiza aparte, sujeta a visita técnica del sitio.',
    'Esta cotización no compromete existencia — se confirma disponibilidad al momento del pedido.'
  ];

  function blobADataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function logoDataUrl(configNegocio) {
    if (configNegocio && configNegocio.logoBlob) {
      try { return await blobADataUrl(configNegocio.logoBlob); } catch (e) { /* sigue al logo por defecto */ }
    }
    try {
      const resp = await fetch('logo-tsi.png');
      if (!resp.ok) return null;
      return await blobADataUrl(await resp.blob());
    } catch (e) {
      return null;
    }
  }

  function formatoFecha(iso) {
    return new Date(iso).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function numeroFormateado(cotizacion) {
    const anio = new Date(cotizacion.fecha).getFullYear();
    return `TSI-${anio}-${String(cotizacion.numero).padStart(3, '0')}`;
  }

  function notaCiudad(ciudadEntrega) {
    return ciudadEntrega === 'fuera'
      ? 'Fuera de Bogotá/Soacha (envío a cargo del cliente)'
      : 'Bogotá / Soacha (domicilio sin costo)';
  }

  function estiloTablaFicha() {
    return {
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 3, lineColor: COLOR_NAVY, lineWidth: 0.2 },
      columnStyles: {
        0: { fontStyle: 'bold', fillColor: COLOR_NAVY_FILL, textColor: COLOR_NAVY, cellWidth: 32 },
        1: { cellWidth: 58 },
        2: { fontStyle: 'bold', fillColor: COLOR_NAVY_FILL, textColor: COLOR_NAVY, cellWidth: 32 },
        3: { cellWidth: 58 }
      },
      margin: { left: MARGEN, right: MARGEN }
    };
  }

  async function generar(cotizacion, configNegocio) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const anchoPagina = doc.internal.pageSize.getWidth();
    const altoPagina = doc.internal.pageSize.getHeight();
    const anchoUtil = anchoPagina - MARGEN * 2;

    // ===== Encabezado =====
    const logo = await logoDataUrl(configNegocio);
    let xTexto = MARGEN;
    if (logo) {
      try {
        doc.addImage(logo, 'PNG', MARGEN, 10, 16, 16, undefined, 'FAST');
        xTexto = MARGEN + 20;
      } catch (e) { console.warn('No se pudo dibujar el logo en el PDF', e); }
    }

    const nombreNegocio = (configNegocio && configNegocio.nombreNegocio) || 'TSI';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(21);
    doc.setTextColor(...COLOR_NAVY);
    doc.text(nombreNegocio.split('—')[0].split('-')[0].trim() || 'TSI', xTexto, 20);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...COLOR_GRAY);
    doc.text('TECHNOLOGY & SECURITY INTELLIGENCE', xTexto, 25, { charSpace: 0.3 });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COLOR_NAVY);
    doc.text('COTIZACIÓN', anchoPagina - MARGEN, 14, { align: 'right' });
    doc.setFontSize(10);
    doc.text(`No. ${numeroFormateado(cotizacion)}`, anchoPagina - MARGEN, 19, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...COLOR_GRAY);
    doc.text(formatoFecha(cotizacion.fecha), anchoPagina - MARGEN, 24, { align: 'right' });

    doc.setDrawColor(...COLOR_NAVY);
    doc.setLineWidth(0.8);
    doc.line(MARGEN, 32, anchoPagina - MARGEN, 32);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...COLOR_NAVY);
    doc.text(SUBTITULO, MARGEN, 40);

    // ===== Ficha del cliente =====
    const cli = cotizacion.cliente;
    doc.autoTable(Object.assign({
      startY: 45,
      body: [
        ['CLIENTE', cli.nombre || '—', 'FECHA', formatoFecha(cotizacion.fecha)],
        ['EMPRESA', cli.empresa || '—', 'TELÉFONO', cli.telefono || '—'],
        ['NIT / CC', cli.nit || '—', 'DIRECCIÓN', cli.direccion || '—'],
        ['CIUDAD', notaCiudad(cli.ciudadEntrega), 'ASESOR', 'TSI · Comercial']
      ]
    }, estiloTablaFicha()));

    // ===== Detalle de la propuesta =====
    let y = doc.lastAutoTable.finalY + 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COLOR_NAVY);
    doc.text('DETALLE DE LA PROPUESTA', MARGEN, y);

    const filas = cotizacion.items.map((it, i) => [
      String(i + 1),
      it.codigo,
      it.descripcion || '',
      String(it.cantidad),
      TC.ui.moneda(it.precioVenta),
      TC.ui.moneda(it.subtotal)
    ]);

    doc.autoTable({
      startY: y + 4,
      head: [['Ítem', 'Código', 'Descripción', 'Cant.', 'V. unitario', 'Total']],
      body: filas,
      theme: 'grid',
      styles: { fontSize: 8.3, cellPadding: 2.4, lineColor: [210, 210, 210], lineWidth: 0.15 },
      headStyles: { fillColor: COLOR_NAVY, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [246, 247, 250] },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 26 },
        3: { cellWidth: 14, halign: 'center' },
        4: { cellWidth: 26, halign: 'right' },
        5: { cellWidth: 26, halign: 'right' }
      },
      margin: { left: MARGEN, right: MARGEN, bottom: 34 },
      didDrawPage: () => dibujarPie(doc, anchoPagina, altoPagina)
    });

    // ===== Totales (IVA desglosado del mismo total, no se suma nada encima) =====
    const subtotalSinIVA = cotizacion.total / (1 + IVA_PORCENTAJE / 100);
    const iva = cotizacion.total - subtotalSinIVA;

    let yTot = doc.lastAutoTable.finalY + 4;
    if (yTot > altoPagina - 90) { doc.addPage(); dibujarPie(doc, anchoPagina, altoPagina); yTot = MARGEN; }

    doc.autoTable({
      startY: yTot,
      body: [
        ['SUBTOTAL', TC.ui.moneda(subtotalSinIVA)],
        [`IVA (${IVA_PORCENTAJE}%)`, TC.ui.moneda(iva)],
        ['TOTAL A PAGAR', TC.ui.moneda(cotizacion.total)]
      ],
      theme: 'grid',
      styles: { fontSize: 9.5, cellPadding: 3, lineColor: COLOR_NAVY, lineWidth: 0.2 },
      columnStyles: { 0: { fontStyle: 'bold', textColor: COLOR_NAVY }, 1: { halign: 'right' } },
      didParseCell: (data) => {
        if (data.row.index === 2) { data.cell.styles.fontStyle = 'bold'; data.cell.styles.fontSize = 11.5; }
      },
      margin: { left: MARGEN, right: MARGEN, bottom: 34 },
      didDrawPage: () => dibujarPie(doc, anchoPagina, altoPagina)
    });

    // ===== Alcance y condiciones =====
    let yc = doc.lastAutoTable.finalY + 8;
    if (yc > altoPagina - 75) { doc.addPage(); dibujarPie(doc, anchoPagina, altoPagina); yc = MARGEN; }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...COLOR_NAVY);
    doc.text('ALCANCE Y CONDICIONES', MARGEN, yc);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLOR_GRAY);
    let yb = yc + 5;
    CONDICIONES.forEach(linea => {
      const envueltas = doc.splitTextToSize(`•  ${linea}`, anchoUtil);
      doc.text(envueltas, MARGEN, yb);
      yb += envueltas.length * 4;
    });

    doc.autoTable({
      startY: yb + 3,
      body: [
        ['FORMA DE PAGO', '50% anticipo / 50% contra entrega, salvo acuerdo comercial diferente.'],
        ['VALIDEZ', '8 días calendario o hasta agotar disponibilidad del proveedor.']
      ],
      theme: 'grid',
      styles: { fontSize: 8.3, cellPadding: 3, lineColor: COLOR_NAVY, lineWidth: 0.2 },
      columnStyles: {
        0: { fontStyle: 'bold', fillColor: COLOR_NAVY, textColor: 255, cellWidth: 38 },
        1: { cellWidth: anchoUtil - 38 }
      },
      margin: { left: MARGEN, right: MARGEN, bottom: 34 },
      didDrawPage: () => dibujarPie(doc, anchoPagina, altoPagina)
    });

    return doc.output('blob');
  }

  function dibujarPie(doc, anchoPagina, altoPagina) {
    const yc = anchoPagina / 2;
    const y0 = altoPagina - 24;
    doc.setDrawColor(...COLOR_NAVY);
    doc.setLineWidth(0.3);
    doc.line(MARGEN, y0, anchoPagina - MARGEN, y0);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...COLOR_NAVY);
    doc.text('TSI — TECHNOLOGY & SECURITY INTELLIGENCE', yc, y0 + 5, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR_GRAY);
    doc.text(SERVICIOS, yc, y0 + 10, { align: 'center' });
    doc.text(CONTACTO, yc, y0 + 14.5, { align: 'center' });

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.8);
    doc.setTextColor(...COLOR_LIGHT_GRAY);
    doc.text(DISCLAIMER, yc, y0 + 19.5, { align: 'center' });
  }

  return { generar };
})();
