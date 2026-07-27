import { Router } from "express";
import { asyncHandler } from "../lib/http";
import * as cuotasService from "../services/cuotas.service";

export const cuotasRouter = Router();

cuotasRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { estado, id_venta } = req.query as Record<string, string | undefined>;
    res.json(
      await cuotasService.listarCuotas({
        estado: estado as "pendiente" | "pagada" | "atrasada" | undefined,
        idVenta: id_venta ? Number(id_venta) : undefined,
      }),
    );
  }),
);

cuotasRouter.patch(
  "/:id/pagar",
  asyncHandler(async (req, res) => {
    res.json(await cuotasService.marcarCuotaPagada(Number(req.params["id"])));
  }),
);
