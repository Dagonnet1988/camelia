import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/http";
import { obtenerConfiguracion } from "../services/configuracion.service";
import { enviarMensajeWhatsapp, normalizarNumeroColombia } from "./client";

function extraerMensajeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function verificarLimites(): Promise<void> {
  const config = await obtenerConfiguracion();
  const ahora = new Date();

  if (config.limiteMensajesHora !== null) {
    const haceUnaHora = new Date(ahora.getTime() - 60 * 60 * 1000);
    const enviadosUltimaHora = await prisma.historialMensajeWhatsapp.count({
      where: { estado: "enviado", fechaEnvio: { gte: haceUnaHora } },
    });
    if (enviadosUltimaHora >= config.limiteMensajesHora) {
      throw new ApiError(429, `Se alcanzo el limite de ${config.limiteMensajesHora} mensajes por hora`);
    }
  }

  if (config.limiteMensajesDia !== null) {
    const inicioDia = new Date(ahora);
    inicioDia.setHours(0, 0, 0, 0);
    const enviadosHoy = await prisma.historialMensajeWhatsapp.count({
      where: { estado: "enviado", fechaEnvio: { gte: inicioDia } },
    });
    if (enviadosHoy >= config.limiteMensajesDia) {
      throw new ApiError(429, `Se alcanzo el limite de ${config.limiteMensajesDia} mensajes por dia`);
    }
  }
}

/** Chequeo "silencioso" (sin dejar rastro en el historial) usado por el procesador de la cola
 * de envios masivos para saber si puede seguir mandando sin intentarlo primero. */
export async function limiteDisponible(): Promise<boolean> {
  try {
    await verificarLimites();
    return true;
  } catch {
    return false;
  }
}

/**
 * Envia un mensaje respetando los limites configurados y deja registro en el historial,
 * tanto si se envia con exito como si falla (por limite excedido o error de WhatsApp).
 */
export async function enviarMensajeControlado(numero: string, texto: string, tipo: string): Promise<void> {
  const numeroNormalizado = normalizarNumeroColombia(numero);

  try {
    await verificarLimites();
  } catch (err) {
    await prisma.historialMensajeWhatsapp.create({
      data: { numero: numeroNormalizado, mensaje: texto, tipo, estado: "fallido", error: extraerMensajeError(err) },
    });
    throw err;
  }

  try {
    await enviarMensajeWhatsapp(numeroNormalizado, texto);
    await prisma.historialMensajeWhatsapp.create({
      data: { numero: numeroNormalizado, mensaje: texto, tipo, estado: "enviado" },
    });
  } catch (err) {
    await prisma.historialMensajeWhatsapp.create({
      data: { numero: numeroNormalizado, mensaje: texto, tipo, estado: "fallido", error: extraerMensajeError(err) },
    });
    throw err;
  }
}

export interface FiltrosHistorial {
  estado?: "enviado" | "fallido";
  limit?: number;
}

export function listarHistorial(filtros: FiltrosHistorial) {
  return prisma.historialMensajeWhatsapp.findMany({
    where: { estado: filtros.estado },
    orderBy: { fechaEnvio: "desc" },
    take: filtros.limit ?? 100,
  });
}
