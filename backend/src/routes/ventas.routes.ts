import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/http";
import { validateBody } from "../lib/validate";
import * as ventasService from "../services/ventas.service";

const registrarVentaSchema = z
  .object({
    codigoProducto: z.string().min(1),
    compradorCelular: z.string().min(1).optional(),
    cantidad: z.number().int().positive(),
    medioPago: z.enum(["contado", "cuotas"]),
    numCuotas: z.number().int().min(1).max(3).optional(),
    recargoCuotas: z.number().nonnegative().optional(),
    canal: z.enum(["whatsapp", "presencial"]),
    fechaVenta: z.coerce.date().optional(),
  })
  .refine((data) => data.medioPago !== "cuotas" || data.numCuotas !== undefined, {
    message: "num_cuotas es requerido cuando medio_pago es cuotas",
    path: ["numCuotas"],
  });

export const ventasRouter = Router();

ventasRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { codigo_producto, comprador_celular, canal, desde, hasta } = req.query as Record<
      string,
      string | undefined
    >;
    res.json(
      await ventasService.listarVentas({
        codigoProducto: codigo_producto,
        compradorCelular: comprador_celular,
        canal: canal as "whatsapp" | "presencial" | undefined,
        desde: desde ? new Date(desde) : undefined,
        hasta: hasta ? new Date(hasta) : undefined,
      }),
    );
  }),
);

ventasRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(await ventasService.obtenerVenta(Number(req.params["id"])));
  }),
);

ventasRouter.post(
  "/",
  validateBody(registrarVentaSchema),
  asyncHandler(async (req, res) => {
    const venta = await ventasService.registrarVenta(req.body);
    res.status(201).json(venta);
  }),
);
