import PDFDocument from "pdfkit";
import type { Response } from "express";
import { resumenProductosVenta } from "./venta-resumen";

const MONEDA = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
// timeZone: "UTC" es obligatorio aca - fechaVenta/fechaLiquidacion ya vienen desplazadas por
// comoBogota() (sus getters UTC representan la hora de Bogota); formatear sin forzar UTC usa la
// zona horaria local del proceso Node y, si esa zona ya es America/Bogota, le resta 5h otra vez
// y puede cruzar la medianoche al dia anterior (mismo bug encontrado en pdf-comprobante.ts).
const FECHA = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

interface VentaLiquidacion {
  id: number;
  fechaVenta: Date;
  items: { producto: { nombre: string } }[];
  valorTotalVenta: unknown;
  comisionPorcentaje: unknown;
  comision: unknown;
}

interface LiquidacionPdfInput {
  id: number;
  fechaLiquidacion: Date;
  totalComision: unknown;
  cantidadVentas: number;
  vendedor: { nombre: string; apellido: string };
  generadaPor: { nombre: string; apellido: string };
  ventas: VentaLiquidacion[];
}

export function generarPdfLiquidacion(liquidacion: LiquidacionPdfInput, res: Response): void {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename=liquidacion-${liquidacion.id}.pdf`);
  doc.pipe(res);

  doc.fontSize(18).text("Camelia", { continued: true }).fontSize(11).text("  Detalles que te hacen especial");
  doc.moveDown(0.5);
  doc.fontSize(14).text(`Liquidación de comisión #${liquidacion.id}`);
  doc.moveDown();

  doc.fontSize(10);
  doc.text(`Vendedor: ${liquidacion.vendedor.nombre} ${liquidacion.vendedor.apellido}`);
  doc.text(`Fecha de liquidación: ${FECHA.format(liquidacion.fechaLiquidacion)}`);
  doc.text(`Generada por: ${liquidacion.generadaPor.nombre} ${liquidacion.generadaPor.apellido}`);
  doc.moveDown();

  const columnas = [
    { titulo: "Fecha", ancho: 65 },
    { titulo: "Producto", ancho: 165 },
    { titulo: "Valor venta", ancho: 90 },
    { titulo: "%", ancho: 40 },
    { titulo: "Comisión", ancho: 90 },
  ];
  const inicioX = doc.page.margins.left;
  let y = doc.y;

  const dibujarFila = (valores: string[], negrita = false): void => {
    let x = inicioX;
    doc.font(negrita ? "Helvetica-Bold" : "Helvetica").fontSize(9);
    for (let i = 0; i < columnas.length; i++) {
      doc.text(valores[i]!, x, y, { width: columnas[i]!.ancho, align: i === 0 ? "left" : "right" });
      x += columnas[i]!.ancho;
    }
    y += 18;
  };

  dibujarFila(
    columnas.map((c) => c.titulo),
    true,
  );
  doc
    .moveTo(inicioX, y)
    .lineTo(inicioX + columnas.reduce((acc, c) => acc + c.ancho, 0), y)
    .stroke();
  y += 6;

  for (const v of liquidacion.ventas) {
    if (y > doc.page.height - 100) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    dibujarFila([
      FECHA.format(v.fechaVenta),
      resumenProductosVenta(v.items),
      MONEDA.format(Number(v.valorTotalVenta)),
      `${Number(v.comisionPorcentaje)}%`,
      MONEDA.format(Number(v.comision)),
    ]);
  }

  y += 6;
  doc
    .moveTo(inicioX, y)
    .lineTo(inicioX + columnas.reduce((acc, c) => acc + c.ancho, 0), y)
    .stroke();
  y += 10;

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(`Total liquidado (${liquidacion.cantidadVentas} ventas): ${MONEDA.format(Number(liquidacion.totalComision))}`, inicioX, y);

  doc.end();
}
