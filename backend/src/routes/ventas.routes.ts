import { Router } from "express";
import { z } from "zod";
import { requireAdmin, requireManagerOrAdmin } from "../lib/auth-middleware";
import { asyncHandler } from "../lib/http";
import { generarPdfComprobanteVenta } from "../lib/pdf-comprobante";
import { validateBody } from "../lib/validate";
import * as ventasService from "../services/ventas.service";

const compradorNuevoSchema = z.object({
  nombre: z.string().min(1),
});

const lineaVentaSchema = z.object({
  codigoProducto: z.string().min(1),
  cantidad: z.number().int().positive(),
  valorUnitario: z.number().nonnegative().optional(),
});

const lineaVentaEdicionSchema = z.object({
  id: z.number().int().positive().optional(),
  codigoProducto: z.string().min(1),
  cantidad: z.number().int().positive(),
  valorUnitario: z.number().nonnegative(),
});

const registrarVentaSchema = z
  .object({
    items: z.array(lineaVentaSchema).min(1),
    compradorCelular: z.string().min(1).optional(),
    compradorNuevo: compradorNuevoSchema.optional(),
    medioPago: z.enum(["contado", "cuotas"]),
    numCuotas: z.number().int().min(1).max(3).optional(),
    frecuenciaCuotas: z.enum(["semanal", "quincenal", "mensual"]).optional(),
    recargoCuotas: z.number().nonnegative().optional(),
    canal: z.enum(["whatsapp", "presencial"]),
    fechaVenta: z.coerce.date().optional(),
    vendedorId: z.number().int().positive().optional(),
  })
  .refine((data) => data.medioPago !== "cuotas" || data.numCuotas !== undefined, {
    message: "num_cuotas es requerido cuando medio_pago es cuotas",
    path: ["numCuotas"],
  })
  .refine((data) => data.medioPago !== "cuotas" || data.frecuenciaCuotas !== undefined, {
    message: "frecuencia_cuotas es requerida cuando medio_pago es cuotas",
    path: ["frecuenciaCuotas"],
  });

const actualizarVentaSchema = z
  .object({
    items: z.array(lineaVentaEdicionSchema).min(1),
    compradorCelular: z.string().min(1).optional(),
    compradorNuevo: compradorNuevoSchema.optional(),
    medioPago: z.enum(["contado", "cuotas"]),
    numCuotas: z.number().int().min(1).max(3).optional(),
    frecuenciaCuotas: z.enum(["semanal", "quincenal", "mensual"]).optional(),
    recargoCuotas: z.number().nonnegative().optional(),
    canal: z.enum(["whatsapp", "presencial"]),
    vendedorId: z.number().int().positive().optional(),
  })
  .refine((data) => data.medioPago !== "cuotas" || data.numCuotas !== undefined, {
    message: "num_cuotas es requerido cuando medio_pago es cuotas",
    path: ["numCuotas"],
  })
  .refine((data) => data.medioPago !== "cuotas" || data.frecuenciaCuotas !== undefined, {
    message: "frecuencia_cuotas es requerida cuando medio_pago es cuotas",
    path: ["frecuenciaCuotas"],
  })
  .refine((data) => data.medioPago !== "cuotas" || data.recargoCuotas !== undefined, {
    message: "recargo_cuotas es requerido cuando medio_pago es cuotas",
    path: ["recargoCuotas"],
  });

export const ventasRouter = Router();

ventasRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { codigo_producto, comprador_celular, canal, vendedor_id, desde, hasta } = req.query as Record<
      string,
      string | undefined
    >;
    res.json(
      await ventasService.listarVentas({
        codigoProducto: codigo_producto,
        compradorCelular: comprador_celular,
        canal: canal as "whatsapp" | "presencial" | undefined,
        vendedorId: vendedor_id ? Number(vendedor_id) : undefined,
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

ventasRouter.get(
  "/:id/comprobante",
  asyncHandler(async (req, res) => {
    const venta = await ventasService.obtenerVentaParaComprobante(Number(req.params["id"]));
    generarPdfComprobanteVenta(venta, res);
  }),
);

ventasRouter.post(
  "/",
  validateBody(registrarVentaSchema),
  asyncHandler(async (req, res) => {
    // Solo admin/manager pueden asignar la venta a otro vendedor; un 'user' siempre queda
    // registrado a su propio nombre sin importar lo que mande el cliente (evita falsearlo).
    const puedeElegirVendedor = req.usuario!.rol === "admin" || req.usuario!.rol === "manager";
    const vendedorId = puedeElegirVendedor && req.body.vendedorId ? req.body.vendedorId : req.usuario!.id;
    const venta = await ventasService.registrarVenta({ ...req.body, vendedorId });
    res.status(201).json(venta);
  }),
);

ventasRouter.put(
  "/:id",
  requireManagerOrAdmin,
  validateBody(actualizarVentaSchema),
  asyncHandler(async (req, res) => {
    const venta = await ventasService.actualizarVenta(Number(req.params["id"]), req.body);
    res.json(venta);
  }),
);

ventasRouter.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    await ventasService.eliminarVenta(Number(req.params["id"]));
    res.status(204).send();
  }),
);
