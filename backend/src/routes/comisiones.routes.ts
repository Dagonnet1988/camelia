import { Router } from "express";
import { asyncHandler } from "../lib/http";
import { generarPdfLiquidacion } from "../lib/pdf-liquidacion";
import * as comisionesService from "../services/comisiones.service";

export const comisionesRouter = Router();

comisionesRouter.get(
  "/vendedores",
  asyncHandler(async (_req, res) => {
    res.json(await comisionesService.listarVendedores());
  }),
);

comisionesRouter.get(
  "/resumen",
  asyncHandler(async (_req, res) => {
    res.json(await comisionesService.resumenPorVendedor());
  }),
);

comisionesRouter.get(
  "/vendedores/:vendedorId/pendientes",
  asyncHandler(async (req, res) => {
    res.json(await comisionesService.ventasPendientes(Number(req.params["vendedorId"])));
  }),
);

comisionesRouter.post(
  "/vendedores/:vendedorId/liquidar",
  asyncHandler(async (req, res) => {
    const liquidacion = await comisionesService.liquidar(Number(req.params["vendedorId"]), req.usuario!.id);
    res.status(201).json(liquidacion);
  }),
);

comisionesRouter.get(
  "/liquidaciones",
  asyncHandler(async (req, res) => {
    const vendedorId = req.query["vendedorId"] ? Number(req.query["vendedorId"]) : undefined;
    res.json(await comisionesService.listarLiquidaciones(vendedorId));
  }),
);

comisionesRouter.get(
  "/liquidaciones/:id/pdf",
  asyncHandler(async (req, res) => {
    const liquidacion = await comisionesService.obtenerLiquidacion(Number(req.params["id"]));
    generarPdfLiquidacion(liquidacion, res);
  }),
);
