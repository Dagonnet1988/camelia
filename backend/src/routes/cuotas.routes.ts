import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/http";
import { validateBody } from "../lib/validate";
import * as cuotasService from "../services/cuotas.service";

const actualizarFechaCuotaSchema = z.object({
  fechaVencimiento: z.coerce.date(),
});

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

cuotasRouter.patch(
  "/:id/fecha",
  validateBody(actualizarFechaCuotaSchema),
  asyncHandler(async (req, res) => {
    res.json(await cuotasService.actualizarFechaCuota(Number(req.params["id"]), req.body.fechaVencimiento));
  }),
);
