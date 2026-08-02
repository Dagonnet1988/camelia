-- CreateTable
CREATE TABLE "fotos_producto" (
    "id" SERIAL NOT NULL,
    "codigo_producto" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fotos_producto_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "fotos_producto" ADD CONSTRAINT "fotos_producto_codigo_producto_fkey" FOREIGN KEY ("codigo_producto") REFERENCES "productos"("codigo") ON DELETE CASCADE ON UPDATE CASCADE;
