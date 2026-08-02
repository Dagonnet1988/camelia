import { Router } from "express";
import { z } from "zod";
import { requireManagerOrAdmin } from "../lib/auth-middleware";
import { CATEGORIAS_PRODUCTO } from "../lib/constantes";
import { asyncHandler, ApiError } from "../lib/http";
import { uploadFotoProducto } from "../lib/upload";
import { validateBody } from "../lib/validate";
import * as productosService from "../services/productos.service";

const crearProductoSchema = z.object({
  codigo: z.string().min(1),
  nombre: z.string().min(1),
  categoria: z.enum(CATEGORIAS_PRODUCTO),
  valorVenta: z.number().positive(),
  stockMinimo: z.number().int().nonnegative().default(0),
});

const actualizarProductoSchema = z.object({
  nombre: z.string().min(1).optional(),
  categoria: z.enum(CATEGORIAS_PRODUCTO).optional(),
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
  requireManagerOrAdmin,
  validateBody(crearProductoSchema),
  asyncHandler(async (req, res) => {
    const producto = await productosService.crearProducto(req.body);
    res.status(201).json(producto);
  }),
);

productosRouter.put(
  "/:codigo",
  requireManagerOrAdmin,
  validateBody(actualizarProductoSchema),
  asyncHandler(async (req, res) => {
    const producto = await productosService.actualizarProducto(req.params["codigo"] as string, req.body);
    res.json(producto);
  }),
);

productosRouter.delete(
  "/:codigo",
  requireManagerOrAdmin,
  asyncHandler(async (req, res) => {
    await productosService.eliminarProducto(req.params["codigo"] as string);
    res.status(204).send();
  }),
);

productosRouter.post(
  "/:codigo/fotos",
  requireManagerOrAdmin,
  uploadFotoProducto.array("fotos", 8),
  asyncHandler(async (req, res) => {
    const archivos = req.files as Express.Multer.File[] | undefined;
    if (!archivos || archivos.length === 0) throw new ApiError(400, "No se recibio ninguna foto");
    const fotos = await productosService.agregarFotos(req.params["codigo"] as string, archivos);
    res.status(201).json(fotos);
  }),
);

productosRouter.delete(
  "/:codigo/fotos/:fotoId",
  requireManagerOrAdmin,
  asyncHandler(async (req, res) => {
    await productosService.eliminarFoto(req.params["codigo"] as string, Number(req.params["fotoId"]));
    res.status(204).send();
  }),
);
