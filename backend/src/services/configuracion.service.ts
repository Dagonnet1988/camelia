import { prisma } from "../lib/prisma";

export async function obtenerConfiguracion() {
  return prisma.configuracionApp.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
}

export interface CambiosConfiguracion {
  recordatoriosCuotasActivos?: boolean;
  limiteMensajesHora?: number | null;
  limiteMensajesDia?: number | null;
}

export async function actualizarConfiguracion(cambios: CambiosConfiguracion) {
  return prisma.configuracionApp.upsert({
    where: { id: 1 },
    update: cambios,
    create: { id: 1, ...cambios },
  });
}
