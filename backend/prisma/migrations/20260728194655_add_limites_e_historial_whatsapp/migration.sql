-- CreateEnum
CREATE TYPE "EstadoMensajeWhatsapp" AS ENUM ('enviado', 'fallido');

-- AlterTable
ALTER TABLE "configuracion_app" ADD COLUMN     "limite_mensajes_dia" INTEGER DEFAULT 100,
ADD COLUMN     "limite_mensajes_hora" INTEGER DEFAULT 20;

-- CreateTable
CREATE TABLE "historial_mensajes_whatsapp" (
    "id" SERIAL NOT NULL,
    "numero" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "estado" "EstadoMensajeWhatsapp" NOT NULL,
    "error" TEXT,
    "fecha_envio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historial_mensajes_whatsapp_pkey" PRIMARY KEY ("id")
);
