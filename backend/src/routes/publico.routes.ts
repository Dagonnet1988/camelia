import { Router } from "express";
import { asyncHandler } from "../lib/http";
import * as productosService from "../services/productos.service";
import { obtenerEstado } from "../whatsapp/client";

export const publicoRouter = Router();

publicoRouter.get(
  "/catalogo",
  asyncHandler(async (_req, res) => {
    res.json(await productosService.listarCatalogoPublico());
  }),
);

// Solo el numero (para el boton "Preguntar por WhatsApp" del catalogo) - nunca el QR ni el
// resto del estado interno, que sigue exclusivo de /api/whatsapp/status (autenticado).
publicoRouter.get(
  "/whatsapp-numero",
  asyncHandler(async (_req, res) => {
    res.json({ numero: obtenerEstado().numero ?? null });
  }),
);
