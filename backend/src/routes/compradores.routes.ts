import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/http";
import { validateBody } from "../lib/validate";
import * as compradoresService from "../services/compradores.service";

const crearCompradorSchema = z.object({
  celular: z.string().min(1),
  nombre: z.string().min(1),
});

const actualizarCompradorSchema = z.object({
  nombre: z.string().min(1),
});

export const compradoresRouter = Router();

compradoresRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await compradoresService.listarCompradores());
  }),
);

compradoresRouter.get(
  "/:celular",
  asyncHandler(async (req, res) => {
    res.json(await compradoresService.obtenerComprador(req.params["celular"] as string));
  }),
);

compradoresRouter.post(
  "/",
  validateBody(crearCompradorSchema),
  asyncHandler(async (req, res) => {
    const comprador = await compradoresService.crearComprador(req.body);
    res.status(201).json(comprador);
  }),
);

compradoresRouter.put(
  "/:celular",
  validateBody(actualizarCompradorSchema),
  asyncHandler(async (req, res) => {
    const comprador = await compradoresService.actualizarComprador(
      req.params["celular"] as string,
      req.body.nombre,
    );
    res.json(comprador);
  }),
);
