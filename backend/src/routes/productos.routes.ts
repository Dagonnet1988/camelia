import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/http";
import { validateBody } from "../lib/validate";
import * as productosService from "../services/productos.service";

const CATEGORIAS = ["arete", "anillo", "manilla", "collar", "otro"] as const;

const crearProductoSchema = z.object({
  codigo: z.string().min(1),
  nombre: z.string().min(1),
  categoria: z.enum(CATEGORIAS),
  valorVenta: z.number().positive(),
  stockMinimo: z.number().int().nonnegative().default(0),
});

const actualizarProductoSchema = z.object({
  nombre: z.string().min(1).optional(),
  categoria: z.enum(CATEGORIAS).optional(),
  valorVenta: z.number().positive().optional(),
  stockMinimo: z.number().int().nonnegative().optional(),
});

export const productosRouter = Router();

productosRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await productosService.listarProductos());
  }),
);

productosRouter.get(
  "/stock-bajo",
  asyncHandler(async (_req, res) => {
    res.json(await productosService.listarStockBajo());
  }),
);

productosRouter.get(
  "/:codigo",
  asyncHandler(async (req, res) => {
    res.json(await productosService.obtenerProducto(req.params["codigo"] as string));
  }),
);

productosRouter.post(
  "/",
  validateBody(crearProductoSchema),
  asyncHandler(async (req, res) => {
    const producto = await productosService.crearProducto(req.body);
    res.status(201).json(producto);
  }),
);

productosRouter.put(
  "/:codigo",
  validateBody(actualizarProductoSchema),
  asyncHandler(async (req, res) => {
    const producto = await productosService.actualizarProducto(req.params["codigo"] as string, req.body);
    res.json(producto);
  }),
);

productosRouter.delete(
  "/:codigo",
  asyncHandler(async (req, res) => {
    await productosService.eliminarProducto(req.params["codigo"] as string);
    res.status(204).send();
  }),
);
