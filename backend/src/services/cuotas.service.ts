import type { EstadoCuota } from "../generated/prisma/enums";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/http";

export interface FiltrosCuotas {
  estado?: EstadoCuota;
  idVenta?: number;
}

async function marcarAtrasadas() {
  await prisma.cuota.updateMany({
    where: { estado: "pendiente", fechaVencimiento: { lt: new Date() } },
    data: { estado: "atrasada" },
  });
}

export async function listarCuotas(filtros: FiltrosCuotas) {
  await marcarAtrasadas();
  return prisma.cuota.findMany({
    where: { estado: filtros.estado, idVenta: filtros.idVenta },
    include: { venta: true },
    orderBy: { fechaVencimiento: "asc" },
  });
}

export async function marcarCuotaPagada(id: number) {
  const cuota = await prisma.cuota.findUnique({ where: { id } });
  if (!cuota) throw new ApiError(404, `Cuota ${id} no existe`);
  if (cuota.estado === "pagada") throw new ApiError(409, `Cuota ${id} ya esta pagada`);

  return prisma.cuota.update({
    where: { id },
    data: { estado: "pagada", fechaPago: new Date() },
  });
}
