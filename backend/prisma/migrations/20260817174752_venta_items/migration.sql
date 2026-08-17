/*
  Warnings:

  - You are about to drop the column `cantidad` on the `ventas` table. All the data in the column will be lost.
  - You are about to drop the column `codigo_producto` on the `ventas` table. All the data in the column will be lost.
  - You are about to drop the column `costo_promedio_al_momento` on the `ventas` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "ventas" DROP CONSTRAINT "ventas_codigo_producto_fkey";

-- AlterTable
ALTER TABLE "ventas" DROP COLUMN "cantidad",
DROP COLUMN "codigo_producto",
DROP COLUMN "costo_promedio_al_momento";

-- CreateTable
CREATE TABLE "venta_items" (
    "id" SERIAL NOT NULL,
    "venta_id" INTEGER NOT NULL,
    "codigo_producto" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "valor_unitario" DECIMAL(12,2) NOT NULL,
    "costo_unitario_al_momento" DECIMAL(12,2) NOT NULL,
    "ganancia" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "venta_items_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "venta_items" ADD CONSTRAINT "venta_items_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta_items" ADD CONSTRAINT "venta_items_codigo_producto_fkey" FOREIGN KEY ("codigo_producto") REFERENCES "productos"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;
