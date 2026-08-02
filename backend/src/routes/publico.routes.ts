import { Router } from "express";
import { asyncHandler } from "../lib/http";
import * as productosService from "../services/productos.service";

export const publicoRouter = Router();

publicoRouter.get(
  "/catalogo",
  asyncHandler(async (_req, res) => {
    res.json(await productosService.listarCatalogoPublico());
  }),
);
