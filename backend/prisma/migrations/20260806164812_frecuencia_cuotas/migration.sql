-- CreateEnum
CREATE TYPE "FrecuenciaCuotas" AS ENUM ('semanal', 'quincenal', 'mensual');

-- AlterTable
ALTER TABLE "ventas" ADD COLUMN     "frecuencia_cuotas" "FrecuenciaCuotas";
