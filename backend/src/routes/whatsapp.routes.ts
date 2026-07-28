import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/http";
import { validateBody } from "../lib/validate";
import { actualizarConfiguracion, obtenerConfiguracion } from "../services/configuracion.service";
import { cerrarSesionWhatsapp, iniciarWhatsapp, obtenerEstado } from "../whatsapp/client";
import {
  cancelarEnvioMasivo,
  crearEnvioMasivo,
  listarEnviosMasivos,
  obtenerEnvioMasivo,
} from "../whatsapp/envios-masivos";
import { enviarMensajeControlado, listarHistorial } from "../whatsapp/mensajes";
import { enviarRecordatoriosCuotas } from "../whatsapp/recordatorios";

const enviarMensajeSchema = z.object({
  numero: z.string().min(5),
  texto: z.string().min(1),
});

const configSchema = z.object({
  recordatoriosCuotasActivos: z.boolean().optional(),
  limiteMensajesHora: z.number().int().positive().nullable().optional(),
  limiteMensajesDia: z.number().int().positive().nullable().optional(),
  envioMasivoDelayMinSeg: z.number().int().min(1).optional(),
  envioMasivoDelayMaxSeg: z.number().int().min(1).optional(),
});

const crearEnvioMasivoSchema = z.object({
  mensaje: z.string().min(1),
  destinatarios: z
    .array(
      z.object({
        celular: z.string().min(5),
        nombre: z.string().min(1),
      }),
    )
    .min(1),
});

export const whatsappRouter = Router();

whatsappRouter.get("/status", (_req, res) => {
  res.json(obtenerEstado());
});

whatsappRouter.post(
  "/reconectar",
  asyncHandler(async (_req, res) => {
    await iniciarWhatsapp();
    res.json(obtenerEstado());
  }),
);

whatsappRouter.post(
  "/logout",
  asyncHandler(async (_req, res) => {
    await cerrarSesionWhatsapp();
    res.json(obtenerEstado());
  }),
);

whatsappRouter.post(
  "/enviar",
  validateBody(enviarMensajeSchema),
  asyncHandler(async (req, res) => {
    await enviarMensajeControlado(req.body.numero, req.body.texto, "manual");
    res.status(201).json({ enviado: true });
  }),
);

whatsappRouter.post(
  "/recordatorios/enviar-ahora",
  asyncHandler(async (_req, res) => {
    await enviarRecordatoriosCuotas();
    res.json({ ejecutado: true });
  }),
);

whatsappRouter.get(
  "/config",
  asyncHandler(async (_req, res) => {
    res.json(await obtenerConfiguracion());
  }),
);

whatsappRouter.put(
  "/config",
  validateBody(configSchema),
  asyncHandler(async (req, res) => {
    res.json(await actualizarConfiguracion(req.body));
  }),
);

whatsappRouter.get(
  "/historial",
  asyncHandler(async (req, res) => {
    const estado = req.query["estado"] as "enviado" | "fallido" | undefined;
    res.json(await listarHistorial({ estado }));
  }),
);

whatsappRouter.get(
  "/envios-masivos",
  asyncHandler(async (_req, res) => {
    res.json(await listarEnviosMasivos());
  }),
);

whatsappRouter.get(
  "/envios-masivos/:id",
  asyncHandler(async (req, res) => {
    res.json(await obtenerEnvioMasivo(Number(req.params["id"])));
  }),
);

whatsappRouter.post(
  "/envios-masivos",
  validateBody(crearEnvioMasivoSchema),
  asyncHandler(async (req, res) => {
    const envio = await crearEnvioMasivo(req.body);
    res.status(201).json(envio);
  }),
);

whatsappRouter.post(
  "/envios-masivos/:id/cancelar",
  asyncHandler(async (req, res) => {
    res.json(await cancelarEnvioMasivo(Number(req.params["id"])));
  }),
);
