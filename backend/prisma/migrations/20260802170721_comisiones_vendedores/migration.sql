-- CreateEnum
CREATE TYPE "EstadoComision" AS ENUM ('pendiente', 'liquidada');

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "porcentaje_comision" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ventas" ADD COLUMN     "comision" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "comision_estado" "EstadoComision" NOT NULL DEFAULT 'pendiente',
ADD COLUMN     "comision_porcentaje" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "liquidacion_id" INTEGER,
ADD COLUMN     "vendedor_id" INTEGER;

-- CreateTable
CREATE TABLE "liquidaciones_comision" (
    "id" SERIAL NOT NULL,
    "vendedor_id" INTEGER NOT NULL,
    "generada_por_id" INTEGER NOT NULL,
    "fecha_liquidacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_comision" DECIMAL(12,2) NOT NULL,
    "cantidad_ventas" INTEGER NOT NULL,

    CONSTRAINT "liquidaciones_comision_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_liquidacion_id_fkey" FOREIGN KEY ("liquidacion_id") REFERENCES "liquidaciones_comision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones_comision" ADD CONSTRAINT "liquidaciones_comision_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones_comision" ADD CONSTRAINT "liquidaciones_comision_generada_por_id_fkey" FOREIGN KEY ("generada_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
