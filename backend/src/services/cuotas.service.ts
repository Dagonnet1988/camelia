import type { EstadoCuota } from "../generated/prisma/enums";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/http";
import { comoBogota } from "../lib/fecha-bogota";

export interface FiltrosCuotas {
  estado?: EstadoCuota;
  idVenta?: number;
}

export async function marcarAtrasadas() {
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
    data: { estado: "pagada", fechaPago: comoBogota(new Date()) },
  });
}

// Corrige la fecha de vencimiento de UNA cuota puntual, sin tocar las demas cuotas de la
// venta (a diferencia de editar la venta, que regenera el set completo). Se resetea
// recordatorio_enviado para que el cron de WhatsApp evalue de nuevo la nueva fecha, y el
// estado vuelve a "pendiente" (marcarAtrasadas la reclasifica a "atrasada" si corresponde en
// la proxima consulta).
export async function actualizarFechaCuota(id: number, fechaVencimiento: Date) {
  const cuota = await prisma.cuota.findUnique({ where: { id } });
  if (!cuota) throw new ApiError(404, `Cuota ${id} no existe`);
  if (cuota.estado === "pagada") throw new ApiError(400, `No se puede cambiar la fecha de una cuota ya pagada`);

  return prisma.cuota.update({
    where: { id },
    data: { fechaVencimiento, estado: "pendiente", recordatorioEnviado: false },
  });
}
