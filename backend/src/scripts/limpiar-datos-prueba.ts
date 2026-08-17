import "dotenv/config";
import { prisma } from "../lib/prisma";

/** Borra todo lo sembrado por seed-datos-prueba.ts (productos SEED-* y sus compradores de prueba). */

const CODIGOS_PRODUCTO = [
  "SEED-ARE-01",
  "SEED-ARE-02",
  "SEED-ANI-01",
  "SEED-ANI-02",
  "SEED-MAN-01",
  "SEED-MAN-02",
  "SEED-COL-01",
  "SEED-COL-02",
  "SEED-OTR-01",
];

const CELULARES_COMPRADOR = ["3001112233", "3012223344", "3023334455", "3034445566", "3045556677", "3056667788"];

async function main(): Promise<void> {
  const ventas = await prisma.venta.findMany({
    where: { items: { some: { codigoProducto: { in: CODIGOS_PRODUCTO } } } },
    select: { id: true },
  });
  const idsVenta = ventas.map((v) => v.id);

  const cuotas = await prisma.cuota.deleteMany({ where: { idVenta: { in: idsVenta } } });
  // venta_items se borra en cascada al borrar la venta (onDelete: Cascade en el schema).
  const ventasBorradas = await prisma.venta.deleteMany({ where: { id: { in: idsVenta } } });
  const fotos = await prisma.fotoProducto.deleteMany({ where: { codigoProducto: { in: CODIGOS_PRODUCTO } } });
  const compras = await prisma.compraInventario.deleteMany({ where: { codigoProducto: { in: CODIGOS_PRODUCTO } } });
  const productos = await prisma.producto.deleteMany({ where: { codigo: { in: CODIGOS_PRODUCTO } } });
  const compradores = await prisma.comprador.deleteMany({ where: { celular: { in: CELULARES_COMPRADOR } } });

  console.log({
    cuotas: cuotas.count,
    ventas: ventasBorradas.count,
    fotos: fotos.count,
    compras: compras.count,
    productos: productos.count,
    compradores: compradores.count,
  });
  console.log("Datos de prueba eliminados.");
}

main()
  .catch((err) => {
    console.error("Error limpiando datos de prueba:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
