import cron from "node-cron";
import { prisma } from "../lib/prisma";
import { obtenerConfiguracion } from "../services/configuracion.service";
import { marcarAtrasadas } from "../services/cuotas.service";
import { enviarMensajeWhatsapp } from "./client";

const DIAS_ANTICIPACION = 2;
const CRON_DIARIO_9AM = "0 9 * * *";

export async function enviarRecordatoriosCuotas(): Promise<void> {
  await marcarAtrasadas();

  const limite = new Date();
  limite.setDate(limite.getDate() + DIAS_ANTICIPACION);

  const cuotas = await prisma.cuota.findMany({
    where: {
      recordatorioEnviado: false,
      estado: { in: ["pendiente", "atrasada"] },
      fechaVencimiento: { lte: limite },
    },
    include: {
      venta: { include: { producto: true, comprador: true } },
    },
  });

  for (const cuota of cuotas) {
    const comprador = cuota.venta.comprador;
    if (!comprador) continue;

    const vencida = cuota.estado === "atrasada";
    const fecha = cuota.fechaVencimiento.toLocaleDateString("es-CO", { timeZone: "UTC" });
    const valor = cuota.valorCuota.toNumber().toLocaleString("es-CO");
    const totalCuotas = cuota.venta.numCuotas ?? "?";
    const nombreProducto = cuota.venta.producto.nombre;

    const texto = vencida
      ? `Hola ${comprador.nombre}, tu cuota ${cuota.numeroCuota}/${totalCuotas} de ${nombreProducto} por $${valor} esta atrasada (vencio el ${fecha}). Por favor ponte al dia cuando puedas.`
      : `Hola ${comprador.nombre}, te recordamos que tu cuota ${cuota.numeroCuota}/${totalCuotas} de ${nombreProducto} por $${valor} vence el ${fecha}.`;

    try {
      await enviarMensajeWhatsapp(comprador.celular, texto);
      await prisma.cuota.update({ where: { id: cuota.id }, data: { recordatorioEnviado: true } });
    } catch (err) {
      console.error(`No se pudo enviar recordatorio de la cuota ${cuota.id}:`, err);
    }
  }
}

export function programarRecordatoriosCuotas(): void {
  cron.schedule(CRON_DIARIO_9AM, () => {
    ejecutarRecordatoriosProgramados().catch((err) => console.error("Error enviando recordatorios:", err));
  });
}

// Respeta el switch de "recordatorios automaticos"; el envio manual (boton "enviar ahora")
// llama directamente a enviarRecordatoriosCuotas() y siempre se ejecuta.
async function ejecutarRecordatoriosProgramados(): Promise<void> {
  const config = await obtenerConfiguracion();
  if (!config.recordatoriosCuotasActivos) {
    console.log("[whatsapp] Recordatorios automaticos desactivados, se omite el envio diario.");
    return;
  }
  await enviarRecordatoriosCuotas();
}
