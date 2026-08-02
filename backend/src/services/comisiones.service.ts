import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/http";

export function listarVendedores() {
  return prisma.usuario.findMany({
    select: { id: true, nombre: true, apellido: true, porcentajeComision: true },
    orderBy: { nombre: "asc" },
  });
}

export async function resumenPorVendedor() {
  const filas = await prisma.venta.groupBy({
    by: ["vendedorId"],
    where: { comisionEstado: "pendiente", vendedorId: { not: null } },
    _sum: { comision: true },
    _count: { _all: true },
  });

  const vendedores = await prisma.usuario.findMany({
    where: { id: { in: filas.map((f) => f.vendedorId as number) } },
    select: { id: true, nombre: true, apellido: true },
  });

  return filas.map((f) => {
    const vendedor = vendedores.find((v) => v.id === f.vendedorId);
    return {
      vendedorId: f.vendedorId as number,
      vendedorNombre: vendedor ? `${vendedor.nombre} ${vendedor.apellido}` : "—",
      cantidadVentas: f._count._all,
      totalComision: f._sum.comision ?? 0,
    };
  });
}

export function ventasPendientes(vendedorId: number) {
  return prisma.venta.findMany({
    where: { vendedorId, comisionEstado: "pendiente" },
    include: { producto: { select: { nombre: true } } },
    orderBy: { fechaVenta: "asc" },
  });
}

export async function liquidar(vendedorId: number, generadaPorId: number) {
  return prisma.$transaction(async (tx) => {
    const ventas = await tx.venta.findMany({ where: { vendedorId, comisionEstado: "pendiente" } });
    if (ventas.length === 0) throw new ApiError(400, "No hay comisiones pendientes para este vendedor");

    const totalComision = ventas.reduce((acc, v) => acc.add(v.comision), new Prisma.Decimal(0));

    const liquidacion = await tx.liquidacion.create({
      data: {
        vendedorId,
        generadaPorId,
        totalComision,
        cantidadVentas: ventas.length,
      },
    });

    await tx.venta.updateMany({
      where: { id: { in: ventas.map((v) => v.id) } },
      data: { comisionEstado: "liquidada", liquidacionId: liquidacion.id },
    });

    return liquidacion;
  });
}

export function listarLiquidaciones(vendedorId?: number) {
  return prisma.liquidacion.findMany({
    where: vendedorId ? { vendedorId } : undefined,
    include: {
      vendedor: { select: { nombre: true, apellido: true } },
      generadaPor: { select: { nombre: true, apellido: true } },
    },
    orderBy: { fechaLiquidacion: "desc" },
  });
}

export async function obtenerLiquidacion(id: number) {
  const liquidacion = await prisma.liquidacion.findUnique({
    where: { id },
    include: {
      vendedor: { select: { nombre: true, apellido: true } },
      generadaPor: { select: { nombre: true, apellido: true } },
      ventas: { include: { producto: { select: { nombre: true } } }, orderBy: { fechaVenta: "asc" } },
    },
  });
  if (!liquidacion) throw new ApiError(404, `Liquidacion ${id} no existe`);
  return liquidacion;
}
