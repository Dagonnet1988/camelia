import type { NextFunction, Request, Response } from "express";
import { ApiError } from "./http";
import { obtenerUsuarioPublico, verificarToken, type UsuarioPublico } from "../services/auth.service";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: UsuarioPublico;
    }
  }
}

export const COOKIE_NAME = "camelia_token";

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.[COOKIE_NAME] as string | undefined;
    if (!token) throw new ApiError(401, "No autenticado");
    const usuarioId = verificarToken(token);
    req.usuario = await obtenerUsuarioPublico(usuarioId);
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.usuario?.rol !== "admin") {
    next(new ApiError(403, "Requiere permisos de administrador"));
    return;
  }
  next();
}
