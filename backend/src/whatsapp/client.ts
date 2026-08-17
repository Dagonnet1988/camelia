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
const RECONEXION_BASE_MS = 3000;
const RECONEXION_MAX_MS = 60_000;
const RECONEXION_MAX_INTENTOS = 8;
const ESTABLE_DESPUES_DE_MS = 30_000;

const logger = pino({ level: "silent" });

export type EstadoWhatsapp = "desconectado" | "conectando" | "esperando_qr" | "conectado";

let socket: WASocket | undefined;
let estado: EstadoWhatsapp = "desconectado";
let qrDataUrl: string | undefined;
let intentosReconexion = 0;
let timeoutEstable: NodeJS.Timeout | undefined;

// El numero vinculado se lee directo de la sesion ya conectada (socket.user.id, formato
// "<numero>:<dispositivo>@s.whatsapp.net") - no hace falta pedirselo al usuario ni guardarlo
// aparte, y siempre queda sincronizado si se reconecta con otro numero.
function numeroVinculado(): string | undefined {
  const id = socket?.user?.id;
  if (!id) return undefined;
  const digitos = id.split(/[:@]/)[0];
  return digitos && /^\d+$/.test(digitos) ? digitos : undefined;
}

export function obtenerEstado(): { estado: EstadoWhatsapp; qr: string | undefined; numero: string | undefined } {
  return { estado, qr: qrDataUrl, numero: estado === "conectado" ? numeroVinculado() : undefined };
}

export async function iniciarWhatsapp(esReintentoAutomatico = false): Promise<void> {
  if (!esReintentoAutomatico) {
    intentosReconexion = 0;
  }
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

      clearTimeout(timeoutEstable);
      timeoutEstable = setTimeout(() => {
        intentosReconexion = 0;
      }, ESTABLE_DESPUES_DE_MS);
    }

    if (connection === "close") {
      qrDataUrl = undefined;
      clearTimeout(timeoutEstable);
      const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      const cerroSesion = statusCode === DisconnectReason.loggedOut;

      if (cerroSesion) {
        estado = "desconectado";
        intentosReconexion = 0;
        console.log("[whatsapp] sesion cerrada");
        return;
      }

      intentosReconexion += 1;
      if (intentosReconexion > RECONEXION_MAX_INTENTOS) {
        estado = "desconectado";
        console.error(
          `[whatsapp] ${RECONEXION_MAX_INTENTOS} intentos de reconexion fallidos seguidos, me detengo. Reconecta manualmente desde /whatsapp.`,
        );
        return;
      }

      const espera = Math.min(RECONEXION_BASE_MS * 2 ** (intentosReconexion - 1), RECONEXION_MAX_MS);
      estado = "conectando";
      console.log(
        `[whatsapp] conexion cerrada (codigo ${statusCode ?? "desconocido"}), reintentando en ${espera}ms (intento ${intentosReconexion}/${RECONEXION_MAX_INTENTOS})...`,
      );
      setTimeout(() => {
        iniciarWhatsapp(true).catch((err) => console.error("Error reconectando WhatsApp:", err));
      }, espera);
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
  intentosReconexion = 0;
  clearTimeout(timeoutEstable);
  await rm(AUTH_DIR, { recursive: true, force: true });
}

// La app solo opera en Colombia: si el numero viene sin indicativo de pais (10 digitos, formato
// celular colombiano), se le antepone el 57 automaticamente.
export function normalizarNumeroColombia(numero: string): string {
  const digitos = numero.replace(/\D/g, "");
  if (digitos.length === 10) {
    return `57${digitos}`;
  }
  return digitos;
}

export async function enviarMensajeWhatsapp(numero: string, texto: string): Promise<void> {
  if (!socket || estado !== "conectado") {
    throw new ApiError(409, "WhatsApp no esta conectado. Vincula el numero desde /whatsapp.");
  }
  const numeroLimpio = normalizarNumeroColombia(numero);
  if (!numeroLimpio) {
    throw new ApiError(400, "Numero de celular invalido");
  }
  const jid = `${numeroLimpio}@s.whatsapp.net`;
  await socket.sendMessage(jid, { text: texto });
}
