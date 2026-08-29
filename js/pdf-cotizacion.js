/* Arma el PDF de una cotización con jsPDF + jspdf-autotable (vendorizados en
   vendor/, sin CDN). Todo pasa en el navegador, nada se sube a ningún lado —
   el PDF resultante es un Blob que la app decide si comparte (navigator.share)
   o descarga. */
var TC = window.TC || (window.TC = {});

TC.pdfCotizacion = (function () {
  function blobADataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  function formatoFecha(iso) {
    return new Date(iso).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  async function generar(cotizacion, configNegocio) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const anchoPagina = doc.internal.pageSize.getWidth();
    const margen = 15;
    let cursorX = margen;

    if (configNegocio && configNegocio.logoBlob) {
      try {
        const dataUrl = await blobADataUrl(configNegocio.logoBlob);
        doc.addImage(dataUrl, 20, 12, 22, 22, undefined, 'FAST');
        cursorX = margen + 26;
      } catch (e) {
        console.warn('No se pudo dibujar el logo en el PDF', e);
      }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text((configNegocio && configNegocio.nombreNegocio) || 'TSI Catálogo', cursorX, 18);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(90);
    let y = 23;
    if (configNegocio && configNegocio.nit) { doc.text(`NIT: ${configNegocio.nit}`, cursorX, y); y += 4.5; }
    if (configNegocio && configNegocio.telefono) { doc.text(`Tel/WhatsApp: ${configNegocio.telefono}`, cursorX, y); y += 4.5; }

    doc.setTextColor(20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`Cotización No. ${cotizacion.numero}`, anchoPagina - margen, 18, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(formatoFecha(cotizacion.fecha), anchoPagina - margen, 23, { align: 'right' });

    const yLinea = 40;
    doc.setDrawColor(210);
    doc.line(margen, yLinea, anchoPagina - margen, yLinea);

    let yCliente = yLinea + 8;
    doc.setTextColor(20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(`Cliente: ${cotizacion.cliente.nombre || '—'}`, margen, yCliente);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(90);
    const detallesCliente = [
      cotizacion.cliente.empresa ? `Empresa: ${cotizacion.cliente.empresa}` : null,
      cotizacion.cliente.telefono ? `Teléfono: ${cotizacion.cliente.telefono}` : null,
      cotizacion.cliente.nit ? `NIT/CC: ${cotizacion.cliente.nit}` : null
    ].filter(Boolean);
    detallesCliente.forEach((linea, i) => doc.text(linea, margen, yCliente + 5.5 + i * 4.5));

    const yTabla = yCliente + 5.5 + detallesCliente.length * 4.5 + 5;

    const filas = cotizacion.items.map(it => [
      it.codigo,
      it.descripcion || '',
      String(it.cantidad),
      TC.ui.moneda(it.precioVenta),
      TC.ui.moneda(it.subtotal)
    ]);

    doc.autoTable({
      startY: yTabla,
      head: [['Código', 'Descripción', 'Cant.', 'Precio unit.', 'Subtotal']],
      body: filas,
      styles: { fontSize: 8.5, cellPadding: 2.2 },
      headStyles: { fillColor: [232, 145, 47], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 28 },
        2: { cellWidth: 14, halign: 'center' },
        3: { cellWidth: 26, halign: 'right' },
        4: { cellWidth: 26, halign: 'right' }
      },
      margin: { left: margen, right: margen }
    });

    const yFinal = doc.lastAutoTable.finalY + 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(20);
    doc.text(`TOTAL: ${TC.ui.moneda(cotizacion.total)}`, anchoPagina - margen, yFinal, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text('Precios sujetos a cambios sin previo aviso. Cotización válida por 8 días.', margen, yFinal + 12);

    return doc.output('blob');
  }

  return { generar };
})();
