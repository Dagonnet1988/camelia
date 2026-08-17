import PDFDocument from "pdfkit";
import type { Response } from "express";

const MONEDA = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
// timeZone: "UTC" es obligatorio aca - fechaVenta/fechaVencimiento/fechaPago ya vienen
// desplazadas por comoBogota() (sus getters UTC representan la hora de Bogota); formatear sin
// forzar UTC usa la zona horaria local del proceso Node y, si esa zona ya es America/Bogota
// (como en dev), le resta 5h otra vez y cruza la medianoche al dia anterior.
const FECHA = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

const ESTADO_CUOTA_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  pagada: "Pagada",
  atrasada: "Atrasada",
};

interface ItemComprobante {
  codigoProducto: string;
  nombreProducto: string;
  cantidad: number;
  valorUnitario: unknown;
}

interface CuotaComprobante {
  numeroCuota: number;
  valorCuota: unknown;
  fechaVencimiento: Date;
  fechaPago: Date | null;
  estado: string;
}

// Solo campos seguros de mostrarle al comprador - nunca costo/ganancia/comision (eso es
// informacion interna del negocio, ver publico.routes.ts para el mismo criterio en el
// catalogo publico).
interface ComprobanteVentaInput {
  id: number;
  fechaVenta: Date;
  medioPago: "contado" | "cuotas";
  frecuenciaCuotas: "semanal" | "quincenal" | "mensual" | null;
  valorContado: unknown;
  recargoCuotas: unknown;
  valorTotalVenta: unknown;
  items: ItemComprobante[];
  cuotas: CuotaComprobante[];
  comprador: { nombre: string; celular: string } | null;
}

export function generarPdfComprobanteVenta(venta: ComprobanteVentaInput, res: Response): void {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename=comprobante-venta-${venta.id}.pdf`);
  doc.pipe(res);

  doc.fontSize(18).text("Camelia", { continued: true }).fontSize(11).text("  Detalles que te hacen especial");
  doc.moveDown(0.5);
  doc.fontSize(14).text(`Comprobante de compra #${venta.id}`);
  doc.moveDown();

  doc.fontSize(10);
  doc.text(`Fecha: ${FECHA.format(venta.fechaVenta)}`);
  doc.text(`Cliente: ${venta.comprador ? venta.comprador.nombre : "Consumidor final"}`);
  doc.text(`Medio de pago: ${venta.medioPago === "cuotas" ? "Cuotas" : "Contado"}`);
  doc.moveDown();

  const columnasItems = [
    { titulo: "Código", ancho: 90 },
    { titulo: "Producto", ancho: 195 },
    { titulo: "Cant.", ancho: 50 },
    { titulo: "Valor unit.", ancho: 90 },
    { titulo: "Subtotal", ancho: 70 },
  ];
  const inicioX = doc.page.margins.left;
  let y = doc.y;

  const dibujarFila = (
    columnas: { titulo: string; ancho: number }[],
    valores: string[],
    negrita = false,
  ): void => {
    let x = inicioX;
    doc.font(negrita ? "Helvetica-Bold" : "Helvetica").fontSize(9);
    for (let i = 0; i < columnas.length; i++) {
      doc.text(valores[i]!, x, y, { width: columnas[i]!.ancho, align: i === 0 ? "left" : "right" });
      x += columnas[i]!.ancho;
    }
    y += 18;
  };

  const lineaHorizontal = (columnas: { titulo: string; ancho: number }[]): void => {
    doc
      .moveTo(inicioX, y)
      .lineTo(inicioX + columnas.reduce((acc, c) => acc + c.ancho, 0), y)
      .stroke();
    y += 6;
  };

  dibujarFila(
    columnasItems,
    columnasItems.map((c) => c.titulo),
    true,
  );
  lineaHorizontal(columnasItems);

  for (const item of venta.items) {
    if (y > doc.page.height - 100) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    dibujarFila(columnasItems, [
      item.codigoProducto,
      item.nombreProducto,
      String(item.cantidad),
      MONEDA.format(Number(item.valorUnitario)),
      MONEDA.format(Number(item.valorUnitario) * item.cantidad),
    ]);
  }
  y += 6;
  lineaHorizontal(columnasItems);
  y += 4;

  doc.font("Helvetica").fontSize(10);
  doc.text(`Subtotal: ${MONEDA.format(Number(venta.valorContado))}`, inicioX, y, { width: 425, align: "right" });
  y += 16;
  if (venta.medioPago === "cuotas" && Number(venta.recargoCuotas) > 0) {
    doc.text(`Recargo por cuotas: ${MONEDA.format(Number(venta.recargoCuotas))}`, inicioX, y, {
      width: 425,
      align: "right",
    });
    y += 16;
  }
  doc.font("Helvetica-Bold").fontSize(12);
  doc.text(`Total: ${MONEDA.format(Number(venta.valorTotalVenta))}`, inicioX, y, { width: 425, align: "right" });
  y += 28;

  if (venta.medioPago === "cuotas") {
    doc.font("Helvetica-Bold").fontSize(11).text("Cuotas", inicioX, y);
    y += 20;

    const columnasCuotas = [
      { titulo: "Cuota", ancho: 60 },
      { titulo: "Valor", ancho: 100 },
      { titulo: "Vence", ancho: 100 },
      { titulo: "Estado", ancho: 100 },
      { titulo: "Fecha de pago", ancho: 90 },
    ];
    dibujarFila(
      columnasCuotas,
      columnasCuotas.map((c) => c.titulo),
      true,
    );
    lineaHorizontal(columnasCuotas);

    for (const cuota of [...venta.cuotas].sort((a, b) => a.numeroCuota - b.numeroCuota)) {
      if (y > doc.page.height - 100) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      dibujarFila(columnasCuotas, [
        `${cuota.numeroCuota}/${venta.cuotas.length}`,
        MONEDA.format(Number(cuota.valorCuota)),
        FECHA.format(cuota.fechaVencimiento),
        ESTADO_CUOTA_LABEL[cuota.estado] ?? cuota.estado,
        cuota.fechaPago ? FECHA.format(cuota.fechaPago) : "—",
      ]);
    }
  }

  doc.moveDown(2);
  doc
    .font("Helvetica")
    .fontSize(8)
    .text("Guarda este comprobante - el código de cada producto te sirve para volver a pedirlo.", inicioX, doc.y, {
      width: 425,
    });

  doc.end();
}
