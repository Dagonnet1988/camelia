import cron from "node-cron";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/http";
import { obtenerConfiguracion } from "../services/configuracion.service";
import { enviarMensajeControlado, limiteDisponible } from "./mensajes";

const CRON_CADA_MINUTO = "* * * * *";

function extraerMensajeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export interface CrearEnvioMasivoInput {
  mensaje: string;
  destinatarios: { celular: string; nombre: string }[];
}

export async function crearEnvioMasivo(input: CrearEnvioMasivoInput) {
  if (input.destinatarios.length === 0) {
    throw new ApiError(400, "Selecciona al menos un comprador");
  }

  const envio = await prisma.envioMasivo.create({
    data: {
      mensaje: input.mensaje,
      totalDestinatarios: input.destinatarios.length,
      destinatarios: {
        createMany: {
          data: input.destinatarios.map((d) => ({ compradorCelular: d.celular, nombre: d.nombre })),
        },
      },
    },
    include: { destinatarios: true },
  });

  // dispara un primer ciclo de procesamiento ya mismo, sin esperar al proximo tick del cron
  procesarEnviosMasivosPendientes().catch((err) => console.error("Error procesando envio masivo:", err));

  return envio;
}

export function listarEnviosMasivos() {
  return prisma.envioMasivo.findMany({
    orderBy: { fechaCreacion: "desc" },
  });
}

export async function obtenerEnvioMasivo(id: number) {
  const envio = await prisma.envioMasivo.findUnique({
    where: { id },
    include: { destinatarios: { orderBy: { id: "asc" } } },
  });
  if (!envio) throw new ApiError(404, `Envio masivo ${id} no existe`);
  return envio;
}

export async function cancelarEnvioMasivo(id: number) {
  await obtenerEnvioMasivo(id);
  return prisma.envioMasivo.update({
    where: { id },
    data: { estado: "cancelado", fechaFin: new Date() },
  });
}

let procesando = false;

export async function procesarEnviosMasivosPendientes(): Promise<void> {
  if (procesando) return;
  procesando = true;
  try {
    const campanas = await prisma.envioMasivo.findMany({
      where: { estado: { in: ["pendiente", "en_progreso"] } },
      orderBy: { fechaCreacion: "asc" },
    });
    for (const campana of campanas) {
      await procesarUnaCampana(campana.id);
    }
  } finally {
    procesando = false;
  }
}

async function procesarUnaCampana(id: number): Promise<void> {
  await prisma.envioMasivo.update({ where: { id }, data: { estado: "en_progreso" } });

  const config = await obtenerConfiguracion();
  const delayMinMs = config.envioMasivoDelayMinSeg * 1000;
  const delayMaxMs = config.envioMasivoDelayMaxSeg * 1000;

  while (true) {
    // releer el estado por si lo cancelaron a mitad de camino
    const actual = await prisma.envioMasivo.findUniqueOrThrow({ where: { id } });
    if (actual.estado === "cancelado") return;

    const siguiente = await prisma.envioMasivoDestinatario.findFirst({
      where: { envioMasivoId: id, estado: "pendiente" },
    });
    if (!siguiente) break;

    if (!(await limiteDisponible())) {
      console.log(`[whatsapp] Envio masivo ${id} en pausa: limite de mensajes alcanzado, se retoma en el proximo ciclo.`);
      return;
    }

    try {
      await enviarMensajeControlado(siguiente.compradorCelular, actual.mensaje, "difusion");
      await prisma.envioMasivoDestinatario.update({
        where: { id: siguiente.id },
        data: { estado: "enviado", fechaEnvio: new Date() },
      });
      await prisma.envioMasivo.update({ where: { id }, data: { enviados: { increment: 1 } } });
    } catch (err) {
      await prisma.envioMasivoDestinatario.update({
        where: { id: siguiente.id },
        data: { estado: "fallido", error: extraerMensajeError(err), fechaEnvio: new Date() },
      });
      await prisma.envioMasivo.update({ where: { id }, data: { fallidos: { increment: 1 } } });
    }

    const restantes = await prisma.envioMasivoDestinatario.count({
      where: { envioMasivoId: id, estado: "pendiente" },
    });
    if (restantes === 0) break;

    // retraso aleatorio entre envios para no saturar WhatsApp / proteger el numero
    const espera = delayMinMs + Math.random() * (delayMaxMs - delayMinMs);
    await new Promise((resolve) => setTimeout(resolve, espera));
  }

  await prisma.envioMasivo.update({ where: { id }, data: { estado: "completado", fechaFin: new Date() } });
}

export function programarEnviosMasivos(): void {
  cron.schedule(CRON_CADA_MINUTO, () => {
    procesarEnviosMasivosPendientes().catch((err) => console.error("Error procesando envios masivos:", err));
  });
}
