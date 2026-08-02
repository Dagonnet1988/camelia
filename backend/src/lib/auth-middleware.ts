import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ApiError } from "./http";
import { obtenerUsuarioPublico, verificarToken, type UsuarioPublico } from "../services/auth.service";
import type { RolUsuario } from "../generated/prisma/enums";

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

export function requireRol(...roles: RolUsuario[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) {
      next(new ApiError(403, "No tienes permisos para esto"));
      return;
    }
    next();
  };
}

export const requireAdmin = requireRol("admin");
export const requireManagerOrAdmin = requireRol("admin", "manager");
