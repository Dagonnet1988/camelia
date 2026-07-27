import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/http";
import { validateBody } from "../lib/validate";
import * as comprasService from "../services/compras.service";

const registrarCompraSchema = z.object({
  codigoProducto: z.string().min(1),
  cantidad: z.number().int().positive(),
  valorCompraUnitario: z.number().positive(),
  proveedor: z.string().min(1).optional(),
  fechaCompra: z.coerce.date().optional(),
});

export const comprasRouter = Router();

comprasRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const codigoProducto = req.query["codigo_producto"] as string | undefined;
    res.json(await comprasService.listarCompras(codigoProducto));
  }),
);

comprasRouter.post(
  "/",
  validateBody(registrarCompraSchema),
  asyncHandler(async (req, res) => {
    const compra = await comprasService.registrarCompra(req.body);
    res.status(201).json(compra);
  }),
);
