-- CreateEnum
CREATE TYPE "EstadoEnvioMasivo" AS ENUM ('pendiente', 'en_progreso', 'completado', 'cancelado');

-- CreateEnum
CREATE TYPE "EstadoEnvioDestinatario" AS ENUM ('pendiente', 'enviado', 'fallido');

-- AlterTable
ALTER TABLE "configuracion_app" ADD COLUMN     "envio_masivo_delay_max_seg" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "envio_masivo_delay_min_seg" INTEGER NOT NULL DEFAULT 5;

-- CreateTable
CREATE TABLE "envios_masivos" (
    "id" SERIAL NOT NULL,
    "mensaje" TEXT NOT NULL,
    "estado" "EstadoEnvioMasivo" NOT NULL DEFAULT 'pendiente',
    "total_destinatarios" INTEGER NOT NULL,
    "enviados" INTEGER NOT NULL DEFAULT 0,
    "fallidos" INTEGER NOT NULL DEFAULT 0,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_fin" TIMESTAMP(3),

    CONSTRAINT "envios_masivos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "envios_masivos_destinatarios" (
    "id" SERIAL NOT NULL,
    "envio_masivo_id" INTEGER NOT NULL,
    "comprador_celular" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "estado" "EstadoEnvioDestinatario" NOT NULL DEFAULT 'pendiente',
    "error" TEXT,
    "fecha_envio" TIMESTAMP(3),

    CONSTRAINT "envios_masivos_destinatarios_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "envios_masivos_destinatarios" ADD CONSTRAINT "envios_masivos_destinatarios_envio_masivo_id_fkey" FOREIGN KEY ("envio_masivo_id") REFERENCES "envios_masivos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
