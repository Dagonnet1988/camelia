import path from "node:path";
import PDFDocument from "pdfkit";
import type { Response } from "express";

const MONEDA = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
// timeZone: "UTC" es obligatorio aca - fechaVenta/fechaVencimiento/fechaPago ya vienen
// desplazadas por comoBogota() (sus getters UTC representan la hora de Bogota); formatear sin
// forzar UTC usa la zona horaria local del proceso Node y, si esa zona ya es America/Bogota
// (como en dev), le resta 5h otra vez y cruza la medianoche al dia anterior.
const FECHA = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

// Paleta de marca (Camelia) - mismos tonos que frontend/src/styles.scss y el logo en
// frontend/public/brand/. No hay una fuente serif propia embebida en la app (el logo es un PNG
// terminado), asi que se usa Times como analogo serif disponible en pdfkit para el look elegante
// del wordmark, sin intentar clonar la tipografia exacta del logo.
const CREMA = "#fbf7f6";
const DORADO = "#b8863e";
const DORADO_CLARO = "#f1e4cf";
const TINTA = "#0b0b0b";
const MUTED = "#52514e";
const ESTADO_COLOR: Record<string, string> = {
  pagada: "#0ca30c",
  pendiente: "#c98a0a", // version mas oscura que --warning (#fab219) - sobre fondo crema el amarillo puro pierde contraste
  atrasada: "#d0553a",
};
const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  pagada: "Pagada",
  atrasada: "Atrasada",
};

const LOGO_PATH = path.join(__dirname, "../assets/brand/logo-maestro.png");

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

type Columna = { titulo: string; ancho: number; align?: "left" | "right" };

export function generarPdfComprobanteVenta(venta: ComprobanteVentaInput, res: Response): void {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename=comprobante-venta-${venta.id}.pdf`);
  doc.pipe(res);

  const inicioX = doc.page.margins.left;
  const anchoContenido = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const pintarFondo = (): void => {
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(CREMA);
  };

  const lineaDorada = (y: number, ancho = anchoContenido): void => {
    doc.moveTo(inicioX, y).lineTo(inicioX + ancho, y).lineWidth(1).strokeColor(DORADO).stroke();
  };

  // Encabezado de continuacion para paginas siguientes (una venta larga, poco comun) - marca
  // discreta en vez de repetir el logo grande de la primera pagina.
  const nuevaPagina = (): number => {
    doc.addPage();
    pintarFondo();
    doc
      .font("Times-Bold")
      .fontSize(11)
      .fillColor(DORADO)
      .text("CAMELIA", inicioX, doc.page.margins.top, { width: anchoContenido, align: "right" });
    const y = doc.page.margins.top + 20;
    lineaDorada(y);
    return y + 14;
  };

  pintarFondo();

  const anchoLogo = 130;
  doc.image(LOGO_PATH, inicioX + (anchoContenido - anchoLogo) / 2, doc.y, { width: anchoLogo });
  let y = doc.y + anchoLogo * (315 / 494) + 18;

  lineaDorada(y);
  y += 16;

  doc
    .font("Times-Bold")
    .fontSize(16)
    .fillColor(TINTA)
    .text(`Comprobante de compra #${venta.id}`, inicioX, y, { width: anchoContenido, align: "center" });
  y += 24;

  const clienteLabel = venta.comprador ? venta.comprador.nombre : "Consumidor final";
  const medioPagoLabel = venta.medioPago === "cuotas" ? "Cuotas" : "Contado";
  doc
    .font("Helvetica")
    .fontSize(9.5)
    .fillColor(MUTED)
    .text(`${FECHA.format(venta.fechaVenta)}  ·  Cliente: ${clienteLabel}  ·  ${medioPagoLabel}`, inicioX, y, {
      width: anchoContenido,
      align: "center",
    });
  y += 30;

  const dibujarEncabezadoTabla = (columnas: Columna[]): void => {
    const alturaBanda = 20;
    doc.rect(inicioX, y - 4, columnas.reduce((acc, c) => acc + c.ancho, 0), alturaBanda).fill(DORADO_CLARO);
    let x = inicioX;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(TINTA);
    for (const c of columnas) {
      doc.text(c.titulo, x + 4, y, { width: c.ancho - 8, align: c.align ?? "right" });
      x += c.ancho;
    }
    y += alturaBanda;
    lineaDorada(y, columnas.reduce((acc, c) => acc + c.ancho, 0));
    y += 8;
  };

  const asegurarEspacio = (columnas: Columna[]): void => {
    if (y > doc.page.height - 110) {
      y = nuevaPagina();
      dibujarEncabezadoTabla(columnas);
    }
  };

  const columnasItems: Columna[] = [
    { titulo: "Código", ancho: 85, align: "left" },
    { titulo: "Producto", ancho: 195, align: "left" },
    { titulo: "Cant.", ancho: 45 },
    { titulo: "Valor unit.", ancho: 90 },
    { titulo: "Subtotal", ancho: 80 },
  ];
  dibujarEncabezadoTabla(columnasItems);

  for (const item of venta.items) {
    asegurarEspacio(columnasItems);
    let x = inicioX;
    doc.font("Helvetica").fontSize(9).fillColor(TINTA);
    const valores = [
      item.codigoProducto,
      item.nombreProducto,
      String(item.cantidad),
      MONEDA.format(Number(item.valorUnitario)),
      MONEDA.format(Number(item.valorUnitario) * item.cantidad),
    ];
    for (const [i, col] of columnasItems.entries()) {
      doc.text(valores[i]!, x + 4, y, { width: col.ancho - 8, align: col.align ?? "right" });
      x += col.ancho;
    }
    y += 18;
  }
  y += 6;

  doc.font("Helvetica").fontSize(10).fillColor(MUTED);
  doc.text(`Subtotal: ${MONEDA.format(Number(venta.valorContado))}`, inicioX, y, { width: anchoContenido, align: "right" });
  y += 16;
  if (venta.medioPago === "cuotas" && Number(venta.recargoCuotas) > 0) {
    doc.text(`Recargo por cuotas: ${MONEDA.format(Number(venta.recargoCuotas))}`, inicioX, y, {
      width: anchoContenido,
      align: "right",
    });
    y += 16;
  }
  y += 4;
  lineaDorada(y, 200 <= anchoContenido ? 200 : anchoContenido);
  // La linea de "Total" se alinea al margen derecho, no a la izquierda - por eso el rule corto
  // se dibuja anclado al borde derecho del contenido, no al inicioX.
  doc.moveTo(inicioX + anchoContenido - 200, y).lineTo(inicioX + anchoContenido, y).lineWidth(1).strokeColor(DORADO).stroke();
  y += 10;
  doc.font("Times-Bold").fontSize(14).fillColor(TINTA).text("Total  ", inicioX, y, { width: anchoContenido - 110, align: "right" });
  doc
    .font("Times-Bold")
    .fontSize(14)
    .fillColor(DORADO)
    .text(MONEDA.format(Number(venta.valorTotalVenta)), inicioX + anchoContenido - 110, y, { width: 110, align: "right" });
  y += 30;

  if (venta.medioPago === "cuotas") {
    asegurarEspacio([]);
    doc.font("Times-Bold").fontSize(12).fillColor(DORADO).text("Cuotas", inicioX, y);
    y += 20;

    const columnasCuotas: Columna[] = [
      { titulo: "Cuota", ancho: 55 },
      { titulo: "Valor", ancho: 90 },
      { titulo: "Vence", ancho: 100 },
      { titulo: "Estado", ancho: 90 },
      { titulo: "Fecha de pago", ancho: 90 },
    ];
    dibujarEncabezadoTabla(columnasCuotas);

    for (const cuota of [...venta.cuotas].sort((a, b) => a.numeroCuota - b.numeroCuota)) {
      asegurarEspacio(columnasCuotas);
      let x = inicioX;
      const valores = [
        `${cuota.numeroCuota}/${venta.cuotas.length}`,
        MONEDA.format(Number(cuota.valorCuota)),
        FECHA.format(cuota.fechaVencimiento),
        ESTADO_LABEL[cuota.estado] ?? cuota.estado,
        cuota.fechaPago ? FECHA.format(cuota.fechaPago) : "—",
      ];
      for (const [i, col] of columnasCuotas.entries()) {
        const esEstado = col.titulo === "Estado";
        doc
          .font(esEstado ? "Helvetica-Bold" : "Helvetica")
          .fontSize(9)
          .fillColor(esEstado ? (ESTADO_COLOR[cuota.estado] ?? TINTA) : TINTA);
        doc.text(valores[i]!, x + 4, y, { width: col.ancho - 8, align: col.align ?? "right" });
        x += col.ancho;
      }
      y += 18;
    }
  }

  y += 20;
  if (y > doc.page.height - 90) y = nuevaPagina();
  lineaDorada(y);
  y += 12;
  doc
    .font("Times-Italic")
    .fontSize(10)
    .fillColor(DORADO)
    .text("Detalles que te hacen especial", inicioX, y, { width: anchoContenido, align: "center" });
  y += 16;
  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor(MUTED)
    .text("Guarda este comprobante - el código de cada producto te sirve para volver a pedirlo.", inicioX, y, {
      width: anchoContenido,
      align: "center",
    });

  doc.end();
}
