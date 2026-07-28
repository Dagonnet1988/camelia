import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/http";
import { validateBody } from "../lib/validate";
import { actualizarConfiguracion, obtenerConfiguracion } from "../services/configuracion.service";
import { cerrarSesionWhatsapp, iniciarWhatsapp, obtenerEstado } from "../whatsapp/client";
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
