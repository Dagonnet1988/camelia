import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/http";
import { validateBody } from "../lib/validate";
import {
  cerrarSesionWhatsapp,
  enviarMensajeWhatsapp,
  iniciarWhatsapp,
  obtenerEstado,
} from "../whatsapp/client";
import { enviarRecordatoriosCuotas } from "../whatsapp/recordatorios";

const enviarMensajeSchema = z.object({
  numero: z.string().min(5),
  texto: z.string().min(1),
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
    await enviarMensajeWhatsapp(req.body.numero, req.body.texto);
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
