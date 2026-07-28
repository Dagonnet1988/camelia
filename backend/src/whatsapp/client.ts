import path from "node:path";
import { rm } from "node:fs/promises";
import { Boom } from "@hapi/boom";
import pino from "pino";
import * as QRCode from "qrcode";
import { ApiError } from "../lib/http";

// baileys es un paquete ESM puro; se importa dinamicamente porque este backend es CommonJS.
async function cargarBaileys() {
  return import("baileys");
}

type BaileysModule = Awaited<ReturnType<typeof cargarBaileys>>;
type WASocket = ReturnType<BaileysModule["default"]>;

const AUTH_DIR = path.join(process.cwd(), "whatsapp-session");
const RECONEXION_MS = 3000;

const logger = pino({ level: "silent" });

export type EstadoWhatsapp = "desconectado" | "conectando" | "esperando_qr" | "conectado";

let socket: WASocket | undefined;
let estado: EstadoWhatsapp = "desconectado";
let qrDataUrl: string | undefined;

export function obtenerEstado(): { estado: EstadoWhatsapp; qr: string | undefined } {
  return { estado, qr: qrDataUrl };
}

export async function iniciarWhatsapp(): Promise<void> {
  estado = "conectando";
  const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } =
    await cargarBaileys();
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  socket = makeWASocket({
    auth: state,
    logger,
    version,
  });

  socket.ev.on("creds.update", saveCreds);

  socket.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      estado = "esperando_qr";
      qrDataUrl = await QRCode.toDataURL(qr);
      console.log("[whatsapp] QR generado, esperando escaneo");
    }

    if (connection === "open") {
      estado = "conectado";
      qrDataUrl = undefined;
      console.log("[whatsapp] conectado");
    }

    if (connection === "close") {
      qrDataUrl = undefined;
      const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      const cerroSesion = statusCode === DisconnectReason.loggedOut;

      if (cerroSesion) {
        estado = "desconectado";
        console.log("[whatsapp] sesion cerrada");
        return;
      }

      estado = "conectando";
      console.log(`[whatsapp] conexion cerrada (codigo ${statusCode ?? "desconocido"}), reintentando...`);
      setTimeout(() => {
        iniciarWhatsapp().catch((err) => console.error("Error reconectando WhatsApp:", err));
      }, RECONEXION_MS);
    }
  });
}

export async function cerrarSesionWhatsapp(): Promise<void> {
  if (socket) {
    await socket.logout().catch(() => undefined);
  }
  socket = undefined;
  estado = "desconectado";
  qrDataUrl = undefined;
  await rm(AUTH_DIR, { recursive: true, force: true });
}

export async function enviarMensajeWhatsapp(numero: string, texto: string): Promise<void> {
  if (!socket || estado !== "conectado") {
    throw new ApiError(409, "WhatsApp no esta conectado. Vincula el numero desde /whatsapp.");
  }
  const numeroLimpio = numero.replace(/\D/g, "");
  if (!numeroLimpio) {
    throw new ApiError(400, "Numero de celular invalido");
  }
  const jid = `${numeroLimpio}@s.whatsapp.net`;
  await socket.sendMessage(jid, { text: texto });
}
