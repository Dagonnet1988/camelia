import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/http";
import { validateBody } from "../lib/validate";
import * as usuariosService from "../services/usuarios.service";

const crearUsuarioSchema = z.object({
  usuario: z.string().min(3),
  nombre: z.string().min(1),
  apellido: z.string().min(1),
  rol: z.enum(["admin", "manager", "user"]).optional(),
});

const actualizarComisionSchema = z.object({
  porcentajeComision: z.number().min(0).max(100),
});

export const usuariosRouter = Router();

usuariosRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await usuariosService.listarUsuarios());
  }),
);

usuariosRouter.post(
  "/",
  validateBody(crearUsuarioSchema),
  asyncHandler(async (req, res) => {
    const usuario = await usuariosService.crearUsuario(req.body);
    res.status(201).json(usuario);
  }),
);

usuariosRouter.put(
  "/:id/comision",
  validateBody(actualizarComisionSchema),
  asyncHandler(async (req, res) => {
    const usuario = await usuariosService.actualizarComision(Number(req.params["id"]), req.body.porcentajeComision);
    res.json(usuario);
  }),
);

usuariosRouter.post(
  "/:id/resetear-password",
  asyncHandler(async (req, res) => {
    const usuario = await usuariosService.resetearPassword(Number(req.params["id"]));
    res.json(usuario);
  }),
);
