import { prisma } from "../lib/prisma";

export async function obtenerConfiguracion() {
  return prisma.configuracionApp.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
}

export async function actualizarRecordatoriosCuotas(activos: boolean) {
  return prisma.configuracionApp.upsert({
    where: { id: 1 },
    update: { recordatoriosCuotasActivos: activos },
    create: { id: 1, recordatoriosCuotasActivos: activos },
  });
}
