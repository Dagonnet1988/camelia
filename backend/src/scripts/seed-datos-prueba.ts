import "dotenv/config";
import type { CategoriaProducto, Canal, FrecuenciaCuotas, MedioPago } from "../generated/prisma/enums";
import { prisma } from "../lib/prisma";
import { registrarCompra } from "../services/compras.service";
import { marcarAtrasadas, marcarCuotaPagada } from "../services/cuotas.service";
import { registrarVenta } from "../services/ventas.service";

/** Data de prueba para ejercitar dashboard/metricas/catalogo publico en desarrollo.
 * Todos los codigos de producto usan el prefijo SEED- para poder identificarlos y
 * borrarlos facilmente despues (ver comando de limpieza en el mensaje final). */

const dias = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

const PRODUCTOS: {
  codigo: string;
  nombre: string;
  categoria: CategoriaProducto;
  valorVenta: number;
  stockMinimo: number;
}[] = [
  { codigo: "SEED-ARE-01", nombre: "Aretes Luna", categoria: "arete", valorVenta: 25000, stockMinimo: 5 },
  { codigo: "SEED-ARE-02", nombre: "Aretes Flor de Camelia", categoria: "arete", valorVenta: 32000, stockMinimo: 5 },
  { codigo: "SEED-ANI-01", nombre: "Anillo Solitario", categoria: "anillo", valorVenta: 45000, stockMinimo: 3 },
  { codigo: "SEED-ANI-02", nombre: "Anillo Trenzado", categoria: "anillo", valorVenta: 38000, stockMinimo: 3 },
  { codigo: "SEED-MAN-01", nombre: "Manilla Perlas", categoria: "manilla", valorVenta: 28000, stockMinimo: 5 },
  { codigo: "SEED-MAN-02", nombre: "Manilla Dorada", categoria: "manilla", valorVenta: 22000, stockMinimo: 5 },
  { codigo: "SEED-COL-01", nombre: "Collar Gargantilla", categoria: "collar", valorVenta: 55000, stockMinimo: 3 },
  { codigo: "SEED-COL-02", nombre: "Collar Camelia", categoria: "collar", valorVenta: 60000, stockMinimo: 3 },
  { codigo: "SEED-OTR-01", nombre: "Set Regalo Completo", categoria: "otro", valorVenta: 95000, stockMinimo: 2 },
];

const COMPRAS: { codigoProducto: string; cantidad: number; valorCompraUnitario: number; proveedor: string; fechaCompra: Date }[] = [
  { codigoProducto: "SEED-ARE-01", cantidad: 20, valorCompraUnitario: 11000, proveedor: "Bisuteria Andina", fechaCompra: dias(75) },
  { codigoProducto: "SEED-ARE-01", cantidad: 10, valorCompraUnitario: 12000, proveedor: "Bisuteria Andina", fechaCompra: dias(20) },
  { codigoProducto: "SEED-ARE-02", cantidad: 15, valorCompraUnitario: 15000, proveedor: "Importadora Sol", fechaCompra: dias(70) },
  { codigoProducto: "SEED-ANI-01", cantidad: 12, valorCompraUnitario: 20000, proveedor: "Bisuteria Andina", fechaCompra: dias(68) },
  { codigoProducto: "SEED-ANI-02", cantidad: 10, valorCompraUnitario: 17000, proveedor: "Importadora Sol", fechaCompra: dias(60) },
  { codigoProducto: "SEED-MAN-01", cantidad: 18, valorCompraUnitario: 13000, proveedor: "Bisuteria Andina", fechaCompra: dias(65) },
  { codigoProducto: "SEED-MAN-02", cantidad: 15, valorCompraUnitario: 10000, proveedor: "Importadora Sol", fechaCompra: dias(55) },
  { codigoProducto: "SEED-COL-01", cantidad: 10, valorCompraUnitario: 26000, proveedor: "Bisuteria Andina", fechaCompra: dias(50) },
  { codigoProducto: "SEED-COL-02", cantidad: 8, valorCompraUnitario: 29000, proveedor: "Importadora Sol", fechaCompra: dias(45) },
  { codigoProducto: "SEED-OTR-01", cantidad: 6, valorCompraUnitario: 48000, proveedor: "Bisuteria Andina", fechaCompra: dias(40) },
];

const COMPRADORES = [
  { celular: "3001112233", nombre: "Valentina Gomez" },
  { celular: "3012223344", nombre: "Mariana Ruiz" },
  { celular: "3023334455", nombre: "Camila Torres" },
  { celular: "3034445566", nombre: "Laura Martinez" },
  { celular: "3045556677", nombre: "Isabella Rojas" },
  { celular: "3056667788", nombre: "Daniela Perez" },
];

interface VentaSeed {
  codigoProducto: string;
  compradorCelular?: string;
  cantidad: number;
  medioPago: MedioPago;
  numCuotas?: number;
  frecuenciaCuotas?: FrecuenciaCuotas;
  canal: Canal;
  fechaVenta: Date;
}

// El recargo por cuotas ahora es global (configuracion_app.recargo_cuotas_global, ajustable
// desde el modulo Comisiones) en vez de un valor por venta - ver SEED_RECARGO_CUOTAS abajo.
const SEED_RECARGO_CUOTAS = 5000;

const VENTAS: VentaSeed[] = [
  { codigoProducto: "SEED-ARE-01", compradorCelular: "3001112233", cantidad: 2, medioPago: "contado", canal: "whatsapp", fechaVenta: dias(58) },
  { codigoProducto: "SEED-ANI-01", compradorCelular: "3012223344", cantidad: 1, medioPago: "cuotas", numCuotas: 2, frecuenciaCuotas: "mensual", canal: "whatsapp", fechaVenta: dias(70) },
  { codigoProducto: "SEED-MAN-01", cantidad: 1, medioPago: "contado", canal: "presencial", fechaVenta: dias(52) },
  { codigoProducto: "SEED-COL-01", compradorCelular: "3023334455", cantidad: 1, medioPago: "cuotas", numCuotas: 3, frecuenciaCuotas: "mensual", canal: "whatsapp", fechaVenta: dias(45) },
  { codigoProducto: "SEED-ARE-02", compradorCelular: "3034445566", cantidad: 1, medioPago: "contado", canal: "presencial", fechaVenta: dias(40) },
  { codigoProducto: "SEED-ANI-02", cantidad: 1, medioPago: "contado", canal: "whatsapp", fechaVenta: dias(38) },
  { codigoProducto: "SEED-MAN-02", compradorCelular: "3001112233", cantidad: 2, medioPago: "contado", canal: "whatsapp", fechaVenta: dias(35) },
  { codigoProducto: "SEED-OTR-01", compradorCelular: "3045556677", cantidad: 1, medioPago: "cuotas", numCuotas: 3, frecuenciaCuotas: "mensual", canal: "presencial", fechaVenta: dias(32) },
  { codigoProducto: "SEED-COL-02", compradorCelular: "3056667788", cantidad: 1, medioPago: "contado", canal: "whatsapp", fechaVenta: dias(28) },
  { codigoProducto: "SEED-ARE-01", compradorCelular: "3012223344", cantidad: 1, medioPago: "contado", canal: "whatsapp", fechaVenta: dias(25) },
  { codigoProducto: "SEED-ANI-01", cantidad: 1, medioPago: "contado", canal: "presencial", fechaVenta: dias(22) },
  { codigoProducto: "SEED-MAN-01", compradorCelular: "3023334455", cantidad: 2, medioPago: "cuotas", numCuotas: 2, frecuenciaCuotas: "mensual", canal: "whatsapp", fechaVenta: dias(20) },
  { codigoProducto: "SEED-ARE-02", cantidad: 1, medioPago: "contado", canal: "whatsapp", fechaVenta: dias(18) },
  { codigoProducto: "SEED-COL-01", compradorCelular: "3034445566", cantidad: 1, medioPago: "contado", canal: "presencial", fechaVenta: dias(15) },
  { codigoProducto: "SEED-ANI-02", compradorCelular: "3001112233", cantidad: 1, medioPago: "cuotas", numCuotas: 1, frecuenciaCuotas: "mensual", canal: "whatsapp", fechaVenta: dias(12) },
  { codigoProducto: "SEED-MAN-02", cantidad: 1, medioPago: "contado", canal: "whatsapp", fechaVenta: dias(9) },
  { codigoProducto: "SEED-ARE-01", compradorCelular: "3045556677", cantidad: 3, medioPago: "contado", canal: "whatsapp", fechaVenta: dias(6) },
  { codigoProducto: "SEED-OTR-01", compradorCelular: "3056667788", cantidad: 1, medioPago: "cuotas", numCuotas: 2, frecuenciaCuotas: "mensual", canal: "presencial", fechaVenta: dias(4) },
  { codigoProducto: "SEED-COL-02", cantidad: 1, medioPago: "contado", canal: "whatsapp", fechaVenta: dias(2) },
];

async function yaSembrado(): Promise<boolean> {
  const existente = await prisma.producto.findUnique({ where: { codigo: PRODUCTOS[0]!.codigo } });
  return existente !== null;
}

async function main(): Promise<void> {
  if (await yaSembrado()) {
    console.log("Los datos de prueba ya existen (se detecto SEED-ARE-01). No se vuelve a sembrar.");
    console.log("Para reiniciar, borra primero con el comando de limpieza del mensaje de este script.");
    return;
  }

  await prisma.configuracionApp.upsert({
    where: { id: 1 },
    update: { recargoCuotasGlobal: SEED_RECARGO_CUOTAS },
    create: { id: 1, recargoCuotasGlobal: SEED_RECARGO_CUOTAS },
  });
  console.log(`Recargo por cuotas global fijado en ${SEED_RECARGO_CUOTAS}`);

  for (const p of PRODUCTOS) {
    await prisma.producto.create({ data: p });
  }
  console.log(`Productos creados: ${PRODUCTOS.length}`);

  for (const c of COMPRAS) {
    await registrarCompra(c);
  }
  console.log(`Compras registradas: ${COMPRAS.length}`);

  for (const c of COMPRADORES) {
    await prisma.comprador.upsert({
      where: { celular: c.celular },
      update: {},
      create: { ...c, fechaPrimeraCompra: dias(80) },
    });
  }
  console.log(`Compradores creados: ${COMPRADORES.length}`);

  const ventasCreadas = [];
  for (const v of VENTAS) {
    ventasCreadas.push(await registrarVenta(v));
  }
  console.log(`Ventas registradas: ${ventasCreadas.length}`);

  // Marca como pagadas las cuotas mas antiguas (~1 de cada 3) para variar el estado de la cartera.
  const todasLasCuotas = ventasCreadas.flatMap((v) => v.cuotas);
  for (let i = 0; i < todasLasCuotas.length; i += 3) {
    await marcarCuotaPagada(todasLasCuotas[i]!.id);
  }
  console.log(`Cuotas marcadas como pagadas: ${Math.ceil(todasLasCuotas.length / 3)}`);

  await marcarAtrasadas();
  console.log("Cuotas vencidas marcadas como atrasadas.");

  console.log("Listo. Datos de prueba sembrados correctamente.");
}

main()
  .catch((err) => {
    console.error("Error sembrando datos de prueba:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
