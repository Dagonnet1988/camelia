import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/http";
import { hashPassword } from "./auth.service";
import type { RolUsuario } from "../generated/prisma/enums";

const SELECT_PUBLICO = {
  id: true,
  usuario: true,
  nombre: true,
  apellido: true,
  rol: true,
  debeCambiarPassword: true,
  fechaCreacion: true,
} as const;

export interface CrearUsuarioInput {
  usuario: string;
  nombre: string;
  apellido: string;
  rol?: RolUsuario;
}

export function listarUsuarios() {
  return prisma.usuario.findMany({
    select: SELECT_PUBLICO,
    orderBy: { fechaCreacion: "asc" },
  });
}

export async function crearUsuario(input: CrearUsuarioInput) {
  const existente = await prisma.usuario.findUnique({ where: { usuario: input.usuario } });
  if (existente) throw new ApiError(409, `Ya existe un usuario con nombre de usuario ${input.usuario}`);

  // Password por defecto = mismo nombre de usuario; se obliga a cambiarla en el primer login.
  const passwordHash = await hashPassword(input.usuario);

  return prisma.usuario.create({
    data: {
      usuario: input.usuario,
      nombre: input.nombre,
      apellido: input.apellido,
      rol: input.rol ?? "user",
      passwordHash,
      debeCambiarPassword: true,
    },
    select: SELECT_PUBLICO,
  });
}

// Resetea la clave al mismo nombre de usuario (igual que al crearlo) y vuelve a obligar el cambio.
export async function resetearPassword(id: number) {
  const usuario = await prisma.usuario.findUnique({ where: { id } });
  if (!usuario) throw new ApiError(404, `Usuario ${id} no existe`);

  const passwordHash = await hashPassword(usuario.usuario);

  return prisma.usuario.update({
    where: { id },
    data: { passwordHash, debeCambiarPassword: true },
    select: SELECT_PUBLICO,
  });
}
