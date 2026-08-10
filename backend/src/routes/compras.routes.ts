import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/http";
import { validateBody } from "../lib/validate";
import * as comprasService from "../services/compras.service";

const productoNuevoSchema = z.object({
  nombre: z.string().min(1),
  categoria: z.string().min(1),
  valorVenta: z.number().positive(),
  stockMinimo: z.number().int().nonnegative().optional(),
});

const registrarCompraSchema = z.object({
  codigoProducto: z.string().min(1),
  cantidad: z.number().int().positive(),
  valorCompraUnitario: z.number().positive(),
  proveedor: z.string().min(1).optional(),
  fechaCompra: z.coerce.date().optional(),
  productoNuevo: productoNuevoSchema.optional(),
});

const registrarCompraLoteSchema = z.object({
  proveedor: z.string().min(1).optional(),
  fechaCompra: z.coerce.date().optional(),
  lineas: z
    .array(
      z.object({
        codigoProducto: z.string().min(1),
        cantidad: z.number().int().positive(),
        valorCompraUnitario: z.number().positive(),
        productoNuevo: productoNuevoSchema.optional(),
      }),
    )
    .min(1),
});

const actualizarCompraSchema = z.object({
  codigoProducto: z.string().min(1).optional(),
  cantidad: z.number().int().positive(),
  valorCompraUnitario: z.number().positive(),
  proveedor: z.string().min(1).optional(),
  fechaCompra: z.coerce.date(),
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

comprasRouter.post(
  "/lote",
  validateBody(registrarCompraLoteSchema),
  asyncHandler(async (req, res) => {
    const compras = await comprasService.registrarCompraLote(req.body);
    res.status(201).json(compras);
  }),
);

comprasRouter.put(
  "/:id",
  validateBody(actualizarCompraSchema),
  asyncHandler(async (req, res) => {
    const compra = await comprasService.actualizarCompra(Number(req.params["id"]), req.body);
    res.json(compra);
  }),
);
