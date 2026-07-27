-- CreateEnum
CREATE TYPE "CategoriaProducto" AS ENUM ('arete', 'anillo', 'manilla', 'collar', 'otro');

-- CreateEnum
CREATE TYPE "MedioPago" AS ENUM ('contado', 'cuotas');

-- CreateEnum
CREATE TYPE "Canal" AS ENUM ('whatsapp', 'presencial');

-- CreateEnum
CREATE TYPE "EstadoCuota" AS ENUM ('pendiente', 'pagada', 'atrasada');

-- CreateTable
CREATE TABLE "productos" (
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" "CategoriaProducto" NOT NULL,
    "valor_venta" DECIMAL(12,2) NOT NULL,
    "costo_promedio" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "stock_actual" INTEGER NOT NULL DEFAULT 0,
    "stock_minimo" INTEGER NOT NULL DEFAULT 0,
    "fecha_ingreso" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "productos_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "compras_inventario" (
    "id" SERIAL NOT NULL,
    "codigo_producto" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "valor_compra_unitario" DECIMAL(12,2) NOT NULL,
    "proveedor" TEXT,
    "fecha_compra" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compras_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compradores" (
    "celular" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "fecha_primera_compra" TIMESTAMP(3),

    CONSTRAINT "compradores_pkey" PRIMARY KEY ("celular")
);

-- CreateTable
CREATE TABLE "ventas" (
    "id" SERIAL NOT NULL,
    "codigo_producto" TEXT NOT NULL,
    "comprador_celular" TEXT,
    "cantidad" INTEGER NOT NULL,
    "valor_contado" DECIMAL(12,2) NOT NULL,
    "medio_pago" "MedioPago" NOT NULL,
    "num_cuotas" INTEGER,
    "recargo_cuotas" DECIMAL(12,2),
    "valor_total_venta" DECIMAL(12,2) NOT NULL,
    "costo_promedio_al_momento" DECIMAL(12,2) NOT NULL,
    "ganancia" DECIMAL(12,2) NOT NULL,
    "canal" "Canal" NOT NULL,
    "fecha_venta" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ventas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuotas" (
    "id" SERIAL NOT NULL,
    "id_venta" INTEGER NOT NULL,
    "numero_cuota" INTEGER NOT NULL,
    "valor_cuota" DECIMAL(12,2) NOT NULL,
    "fecha_vencimiento" DATE NOT NULL,
    "fecha_pago" DATE,
    "estado" "EstadoCuota" NOT NULL DEFAULT 'pendiente',

    CONSTRAINT "cuotas_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "compras_inventario" ADD CONSTRAINT "compras_inventario_codigo_producto_fkey" FOREIGN KEY ("codigo_producto") REFERENCES "productos"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_codigo_producto_fkey" FOREIGN KEY ("codigo_producto") REFERENCES "productos"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_comprador_celular_fkey" FOREIGN KEY ("comprador_celular") REFERENCES "compradores"("celular") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuotas" ADD CONSTRAINT "cuotas_id_venta_fkey" FOREIGN KEY ("id_venta") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
