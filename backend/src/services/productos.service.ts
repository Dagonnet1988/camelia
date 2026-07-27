import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/http";
import type { CategoriaProducto } from "../generated/prisma/enums";

export interface CrearProductoInput {
  codigo: string;
  nombre: string;
  categoria: CategoriaProducto;
  valorVenta: number;
  stockMinimo: number;
}

export interface ActualizarProductoInput {
  nombre?: string;
  categoria?: CategoriaProducto;
  valorVenta?: number;
  stockMinimo?: number;
}

export function listarProductos() {
  return prisma.producto.findMany({ orderBy: { codigo: "asc" } });
}

export async function obtenerProducto(codigo: string) {
  const producto = await prisma.producto.findUnique({ where: { codigo } });
  if (!producto) throw new ApiError(404, `Producto ${codigo} no existe`);
  return producto;
}

export async function crearProducto(input: CrearProductoInput) {
  const existente = await prisma.producto.findUnique({ where: { codigo: input.codigo } });
  if (existente) throw new ApiError(409, `Ya existe un producto con codigo ${input.codigo}`);

  return prisma.producto.create({
    data: {
      codigo: input.codigo,
      nombre: input.nombre,
      categoria: input.categoria,
      valorVenta: input.valorVenta,
      stockMinimo: input.stockMinimo,
    },
  });
}

export async function actualizarProducto(codigo: string, input: ActualizarProductoInput) {
  await obtenerProducto(codigo);
  return prisma.producto.update({
    where: { codigo },
    data: input,
  });
}

export async function eliminarProducto(codigo: string) {
  await obtenerProducto(codigo);
  await prisma.producto.delete({ where: { codigo } });
}

export function listarStockBajo() {
  return prisma.$queryRaw`
    SELECT * FROM productos WHERE stock_actual <= stock_minimo ORDER BY stock_actual ASC
  `;
}
