import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/http";
import type { RolUsuario } from "../generated/prisma/enums";

const JWT_SECRET = process.env["JWT_SECRET"];
if (!JWT_SECRET) {
  throw new Error("Falta JWT_SECRET en las variables de entorno");
}
const JWT_EXPIRACION = "7d";
const SALT_ROUNDS = 10;

export interface UsuarioPublico {
  id: number;
  usuario: string;
  nombre: string;
  apellido: string;
  rol: RolUsuario;
  debeCambiarPassword: boolean;
  porcentajeComision: string;
}

interface UsuarioCompleto {
  id: number;
  usuario: string;
  nombre: string;
  apellido: string;
  rol: RolUsuario;
  passwordHash: string;
  debeCambiarPassword: boolean;
  porcentajeComision: unknown;
}

function aPublico(u: UsuarioCompleto): UsuarioPublico {
  return {
    id: u.id,
    usuario: u.usuario,
    nombre: u.nombre,
    apellido: u.apellido,
    rol: u.rol,
    debeCambiarPassword: u.debeCambiarPassword,
    porcentajeComision: String(u.porcentajeComision),
  };
}

export function generarToken(usuarioId: number): string {
  return jwt.sign({ sub: String(usuarioId) }, JWT_SECRET as string, { expiresIn: JWT_EXPIRACION });
}

export function verificarToken(token: string): number {
  try {
    const payload = jwt.verify(token, JWT_SECRET as string);
    if (typeof payload === "string" || !payload.sub) {
      throw new Error("Token sin sub");
    }
    return Number(payload.sub);
  } catch {
    throw new ApiError(401, "Sesion invalida o expirada");
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function obtenerUsuarioPublico(id: number): Promise<UsuarioPublico> {
  const usuario = await prisma.usuario.findUnique({ where: { id } });
  if (!usuario) throw new ApiError(401, "Usuario no existe");
  return aPublico(usuario);
}

export async function login(
  usuarioTexto: string,
  password: string,
): Promise<UsuarioPublico & { token: string }> {
  const usuario = await prisma.usuario.findUnique({ where: { usuario: usuarioTexto } });
  if (!usuario) throw new ApiError(401, "Usuario o contraseña incorrectos");

  const passwordValida = await bcrypt.compare(password, usuario.passwordHash);
  if (!passwordValida) throw new ApiError(401, "Usuario o contraseña incorrectos");

  const token = generarToken(usuario.id);
  return { ...aPublico(usuario), token };
}

export async function cambiarPassword(
  usuarioId: number,
  passwordActual: string | undefined,
  passwordNueva: string,
): Promise<UsuarioPublico> {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario) throw new ApiError(401, "Usuario no existe");

  // En el primer login (debeCambiarPassword) no se exige la contraseña actual, ya que el usuario
  // apenas la recibio (igual a su nombre de usuario) y el objetivo es forzar el cambio, no
  // volver a pedirle algo que acaba de escribir para entrar.
  if (!usuario.debeCambiarPassword) {
    if (!passwordActual) throw new ApiError(400, "La contraseña actual es obligatoria");
    const passwordValida = await bcrypt.compare(passwordActual, usuario.passwordHash);
    if (!passwordValida) throw new ApiError(400, "La contraseña actual no es correcta");
  }

  if (passwordNueva.length < 6) {
    throw new ApiError(400, "La nueva contraseña debe tener al menos 6 caracteres");
  }

  const passwordHash = await hashPassword(passwordNueva);
  const actualizado = await prisma.usuario.update({
    where: { id: usuarioId },
    data: { passwordHash, debeCambiarPassword: false },
  });
  return aPublico(actualizado);
}
