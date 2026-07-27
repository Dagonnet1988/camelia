import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/http";

export interface CrearCompradorInput {
  celular: string;
  nombre: string;
}

export function listarCompradores() {
  return prisma.comprador.findMany({ orderBy: { nombre: "asc" } });
}

export async function obtenerComprador(celular: string) {
  const comprador = await prisma.comprador.findUnique({ where: { celular } });
  if (!comprador) throw new ApiError(404, `Comprador ${celular} no existe`);
  return comprador;
}

export async function crearComprador(input: CrearCompradorInput) {
  const existente = await prisma.comprador.findUnique({ where: { celular: input.celular } });
  if (existente) throw new ApiError(409, `Ya existe un comprador con celular ${input.celular}`);

  return prisma.comprador.create({ data: input });
}

export async function actualizarComprador(celular: string, nombre: string) {
  await obtenerComprador(celular);
  return prisma.comprador.update({ where: { celular }, data: { nombre } });
}
