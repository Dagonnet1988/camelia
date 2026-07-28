-- CreateTable
CREATE TABLE "configuracion_app" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "recordatorios_cuotas_activos" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "configuracion_app_pkey" PRIMARY KEY ("id")
);
