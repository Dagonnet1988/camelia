import { Router } from "express";
import { asyncHandler } from "../lib/http";
import * as metrics from "../services/metrics.service";

export const metricsRouter = Router();

function parseRango(query: Record<string, unknown>) {
  const desde = query["desde"] ? new Date(String(query["desde"])) : undefined;
  const hasta = query["hasta"] ? new Date(String(query["hasta"])) : undefined;
  return { desde, hasta };
}

metricsRouter.get(
  "/top-productos",
  asyncHandler(async (req, res) => {
    const limit = Number(req.query["limit"] ?? 10);
    res.json(await metrics.topProductos(parseRango(req.query), limit));
  }),
);

metricsRouter.get(
  "/margen-productos",
  asyncHandler(async (_req, res) => {
    res.json(await metrics.margenPorProducto());
  }),
);

metricsRouter.get(
  "/rotacion-inventario",
  asyncHandler(async (req, res) => {
    const dias = Number(req.query["dias"] ?? 30);
    res.json(await metrics.rotacionInventario(dias));
  }),
);

metricsRouter.get(
  "/ganancia-acumulada",
  asyncHandler(async (req, res) => {
    const periodo = req.query["periodo"] === "mes" ? "mes" : "semana";
    res.json(await metrics.gananciaAcumulada(periodo));
  }),
);

metricsRouter.get(
  "/abc",
  asyncHandler(async (_req, res) => {
    res.json(await metrics.analisisAbc());
  }),
);

metricsRouter.get(
  "/ticket-promedio",
  asyncHandler(async (_req, res) => {
    res.json(await metrics.ticketPromedio());
  }),
);

metricsRouter.get(
  "/contado-vs-cuotas",
  asyncHandler(async (_req, res) => {
    res.json(await metrics.contadoVsCuotas());
  }),
);

metricsRouter.get(
  "/cartera-cuotas",
  asyncHandler(async (_req, res) => {
    res.json(await metrics.carteraCuotas());
  }),
);

metricsRouter.get(
  "/stock-muerto",
  asyncHandler(async (req, res) => {
    const dias = Number(req.query["dias"] ?? 30);
    res.json(await metrics.stockMuerto(dias));
  }),
);

metricsRouter.get(
  "/costos-proveedor",
  asyncHandler(async (_req, res) => {
    res.json(await metrics.historialCostosProveedor());
  }),
);
