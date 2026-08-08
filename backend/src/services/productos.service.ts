import fs from "node:fs";
import path from "node:path";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/http";
import { UPLOADS_DIR } from "../lib/upload";
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
  proveedor?: string;
}

export function listarProductos() {
  return prisma.producto.findMany({
    orderBy: { codigo: "asc" },
    include: { fotos: { orderBy: { orden: "asc" } } },
  });
}

/** Catalogo publico (sin login): solo lo necesario para que un comprador navegue.
 * Los productos agotados (stock 0) se ocultan en vez de mostrarse como "agotado". */
export function listarCatalogoPublico() {
  return prisma.producto.findMany({
    where: { stockActual: { gt: 0 } },
    orderBy: { fechaIngreso: "desc" },
    select: {
      codigo: true,
      nombre: true,
      categoria: true,
      valorVenta: true,
      fotos: { orderBy: { orden: "asc" }, select: { url: true } },
    },
  });
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

export async function agregarFotos(codigo: string, archivos: Express.Multer.File[]) {
  await obtenerProducto(codigo);

  const ultima = await prisma.fotoProducto.findFirst({
    where: { codigoProducto: codigo },
    orderBy: { orden: "desc" },
  });
  let siguienteOrden = (ultima?.orden ?? -1) + 1;

  await prisma.fotoProducto.createMany({
    data: archivos.map((archivo) => ({
      codigoProducto: codigo,
      url: `/uploads/productos/${archivo.filename}`,
      orden: siguienteOrden++,
    })),
  });

  return prisma.fotoProducto.findMany({ where: { codigoProducto: codigo }, orderBy: { orden: "asc" } });
}

export async function eliminarFoto(codigo: string, fotoId: number) {
  const foto = await prisma.fotoProducto.findUnique({ where: { id: fotoId } });
  if (!foto || foto.codigoProducto !== codigo) throw new ApiError(404, "Foto no encontrada");

  await prisma.fotoProducto.delete({ where: { id: fotoId } });

  const rutaArchivo = path.join(UPLOADS_DIR, path.basename(foto.url));
  fs.unlink(rutaArchivo, () => {});
}

export function listarStockBajo() {
  return prisma.$queryRaw`
    SELECT * FROM productos WHERE stock_actual <= stock_minimo ORDER BY stock_actual ASC
  `;
}
