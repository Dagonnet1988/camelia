import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/http";
import { validateBody } from "../lib/validate";
import { COOKIE_NAME, requireAuth } from "../lib/auth-middleware";
import * as authService from "../services/auth.service";

const loginSchema = z.object({
  usuario: z.string().min(1),
  password: z.string().min(1),
});

const cambiarPasswordSchema = z.object({
  passwordActual: z.string().min(1),
  passwordNueva: z.string().min(6),
});

const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const authRouter = Router();

authRouter.post(
  "/login",
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { token, ...usuario } = await authService.login(req.body.usuario, req.body.password);
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env["NODE_ENV"] === "production",
      maxAge: COOKIE_MAX_AGE_MS,
    });
    res.json(usuario);
  }),
);

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json(req.usuario);
});

authRouter.post(
  "/cambiar-password",
  requireAuth,
  validateBody(cambiarPasswordSchema),
  asyncHandler(async (req, res) => {
    const usuario = await authService.cambiarPassword(
      req.usuario!.id,
      req.body.passwordActual,
      req.body.passwordNueva,
    );
    res.json(usuario);
  }),
);
