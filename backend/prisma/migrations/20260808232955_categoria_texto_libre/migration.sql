-- Convierte categoria de enum fijo a texto libre, preservando los valores existentes
-- (el USING hace el cast enum -> text sin perder datos, a diferencia del DROP+ADD que
-- Prisma genera por defecto para este tipo de cambio).
ALTER TABLE "productos" ALTER COLUMN "categoria" TYPE TEXT USING "categoria"::text;

-- DropEnum
DROP TYPE "CategoriaProducto";
