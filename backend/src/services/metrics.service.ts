import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { marcarAtrasadas } from "./cuotas.service";

export interface RangoFechas {
  desde?: Date;
  hasta?: Date;
}

// 1. Top productos: por unidades vendidas y por ingresos (pueden diferir).
export async function topProductos(rango: RangoFechas, limit: number) {
  const filas = await prisma.$queryRaw<
    { codigo: string; nombre: string; unidadesVendidas: number; ingresos: string }[]
  >`
    SELECT p.codigo,
           p.nombre,
           SUM(v.cantidad)::int AS "unidadesVendidas",
           SUM(v.valor_total_venta)::numeric(14,2)::text AS "ingresos"
    FROM ventas v
    JOIN productos p ON p.codigo = v.codigo_producto
    WHERE v.fecha_venta >= COALESCE(${rango.desde ?? null}, '-infinity'::timestamp)
      AND v.fecha_venta <= COALESCE(${rango.hasta ?? null}, 'infinity'::timestamp)
    GROUP BY p.codigo, p.nombre
  `;

  const porUnidades = [...filas].sort((a, b) => b.unidadesVendidas - a.unidadesVendidas).slice(0, limit);
  const porIngresos = [...filas]
    .sort((a, b) => Number(b.ingresos) - Number(a.ingresos))
    .slice(0, limit);

  return { porUnidades, porIngresos };
}

// 2. Margen por producto: (valor_venta - costo_ultima_compra) / valor_venta, ranking de mejor % de ganancia.
// Usa el valor_compra_unitario de la compra mas reciente de cada producto (no el costo promedio
// ponderado) porque para reportes externos se pide el costo de compra real y documentado, no un
// calculo interno.
export async function margenPorProducto() {
  const productos = await prisma.producto.findMany();
  const compras = await prisma.compraInventario.findMany({
    orderBy: [{ fechaCompra: "desc" }, { id: "desc" }],
    select: { codigoProducto: true, valorCompraUnitario: true },
  });

  const costoUltimaCompra = new Map<string, Prisma.Decimal>();
  for (const c of compras) {
    if (!costoUltimaCompra.has(c.codigoProducto)) {
      costoUltimaCompra.set(c.codigoProducto, c.valorCompraUnitario);
    }
  }

  return productos
    .map((p) => {
      const costoCompra = costoUltimaCompra.get(p.codigo) ?? p.costoPromedio;
      return {
        codigo: p.codigo,
        nombre: p.nombre,
        categoria: p.categoria,
        valorVenta: p.valorVenta,
        costoCompra,
        margen: p.valorVenta.isZero()
          ? new Prisma.Decimal(0)
          : p.valorVenta.sub(costoCompra).div(p.valorVenta),
      };
    })
    .sort((a, b) => b.margen.cmp(a.margen));
}

// 3. Rotacion de inventario: unidades vendidas / tiempo, por producto y por categoria.
export async function rotacionInventario(dias: number) {
  const desde = new Date();
  desde.setDate(desde.getDate() - dias);

  const porProducto = await prisma.$queryRaw<
    { codigo: string; nombre: string; categoria: string; unidadesVendidas: number; rotacionDiaria: string }[]
  >`
    SELECT p.codigo,
           p.nombre,
           p.categoria::text AS categoria,
           COALESCE(SUM(v.cantidad), 0)::int AS "unidadesVendidas",
           (COALESCE(SUM(v.cantidad), 0)::numeric / ${dias})::numeric(10,4)::text AS "rotacionDiaria"
    FROM productos p
    LEFT JOIN ventas v ON v.codigo_producto = p.codigo AND v.fecha_venta >= ${desde}
    GROUP BY p.codigo, p.nombre, p.categoria
    ORDER BY "rotacionDiaria" DESC
  `;

  const porCategoria = await prisma.$queryRaw<
    { categoria: string; unidadesVendidas: number; rotacionDiaria: string }[]
  >`
    SELECT p.categoria::text AS categoria,
           COALESCE(SUM(v.cantidad), 0)::int AS "unidadesVendidas",
           (COALESCE(SUM(v.cantidad), 0)::numeric / ${dias})::numeric(10,4)::text AS "rotacionDiaria"
    FROM productos p
    LEFT JOIN ventas v ON v.codigo_producto = p.codigo AND v.fecha_venta >= ${desde}
    GROUP BY p.categoria
    ORDER BY "rotacionDiaria" DESC
  `;

  return { dias, porProducto, porCategoria };
}

// 4. Ganancia acumulada por semana/mes, con tendencia.
export async function gananciaAcumulada(periodo: "semana" | "mes") {
  const unidad = periodo === "semana" ? "week" : "month";
  const filas = await prisma.$queryRaw<{ periodo: Date; ganancia: string }[]>`
    SELECT date_trunc(${unidad}, fecha_venta) AS periodo,
           SUM(ganancia)::numeric(14,2)::text AS ganancia
    FROM ventas
    GROUP BY periodo
    ORDER BY periodo ASC
  `;

  let acumulado = new Prisma.Decimal(0);
  return filas.map((f) => {
    acumulado = acumulado.add(f.ganancia);
    return { periodo: f.periodo, ganancia: f.ganancia, gananciaAcumulada: acumulado.toFixed(2) };
  });
}

// 5. Analisis ABC: clasificar productos en A/B/C segun % de ganancia que aportan.
export async function analisisAbc() {
  const filas = await prisma.$queryRaw<{ codigo: string; nombre: string; ganancia: string }[]>`
    SELECT p.codigo, p.nombre, SUM(v.ganancia)::numeric(14,2)::text AS ganancia
    FROM ventas v
    JOIN productos p ON p.codigo = v.codigo_producto
    GROUP BY p.codigo, p.nombre
    ORDER BY ganancia DESC
  `;

  const totalGanancia = filas.reduce((acc, f) => acc.add(f.ganancia), new Prisma.Decimal(0));
  let acumulado = new Prisma.Decimal(0);

  return filas.map((f) => {
    acumulado = acumulado.add(f.ganancia);
    const porcentajeAcumulado = totalGanancia.isZero()
      ? new Prisma.Decimal(0)
      : acumulado.div(totalGanancia).mul(100);

    const clase = porcentajeAcumulado.lte(80) ? "A" : porcentajeAcumulado.lte(95) ? "B" : "C";

    return {
      codigo: f.codigo,
      nombre: f.nombre,
      ganancia: f.ganancia,
      porcentajeAcumulado: porcentajeAcumulado.toFixed(2),
      clase,
    };
  });
}

// 6. Ticket promedio: general y por comprador (frecuencia de recompra por celular).
export async function ticketPromedio() {
  const general = await prisma.venta.aggregate({
    _avg: { valorTotalVenta: true },
    _count: { id: true },
  });

  const porComprador = await prisma.$queryRaw<
    { compradorCelular: string; nombre: string; numeroVentas: number; ticketPromedio: string }[]
  >`
    SELECT v.comprador_celular AS "compradorCelular",
           c.nombre,
           COUNT(*)::int AS "numeroVentas",
           AVG(v.valor_total_venta)::numeric(14,2)::text AS "ticketPromedio"
    FROM ventas v
    JOIN compradores c ON c.celular = v.comprador_celular
    WHERE v.comprador_celular IS NOT NULL
    GROUP BY v.comprador_celular, c.nombre
    ORDER BY "numeroVentas" DESC
  `;

  return {
    general: {
      ticketPromedio: general._avg.valorTotalVenta?.toFixed(2) ?? "0.00",
      numeroVentas: general._count.id,
    },
    porComprador,
  };
}

// 7. Contado vs cuotas: comparar margen efectivo y sugerir ajuste de recargo segun mora historica.
export async function contadoVsCuotas() {
  await marcarAtrasadas();

  const porMedioPago = await prisma.$queryRaw<
    { medioPago: string; numeroVentas: number; margenPromedio: string; recargoPromedio: string }[]
  >`
    SELECT medio_pago AS "medioPago",
           COUNT(*)::int AS "numeroVentas",
           AVG(CASE WHEN valor_total_venta = 0 THEN 0 ELSE ganancia / valor_total_venta END)::numeric(6,4)::text AS "margenPromedio",
           COALESCE(AVG(recargo_cuotas), 0)::numeric(14,2)::text AS "recargoPromedio"
    FROM ventas
    GROUP BY medio_pago
  `;

  const mora = await prisma.$queryRaw<{ total: number; atrasadas: number }[]>`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE estado = 'atrasada')::int AS atrasadas
    FROM cuotas
  `;

  const totalCuotas = mora[0]?.total ?? 0;
  const cuotasAtrasadas = mora[0]?.atrasadas ?? 0;
  const tasaMora = totalCuotas === 0 ? 0 : cuotasAtrasadas / totalCuotas;

  const contado = porMedioPago.find((f) => f.medioPago === "contado");
  const cuotas = porMedioPago.find((f) => f.medioPago === "cuotas");

  let sugerencia = "No hay suficientes datos de ventas a cuotas para evaluar el recargo.";
  if (contado && cuotas) {
    const margenContado = Number(contado.margenPromedio);
    const margenCuotas = Number(cuotas.margenPromedio);
    if (tasaMora > 0.15 && margenCuotas <= margenContado) {
      sugerencia = `La tasa de mora (${(tasaMora * 100).toFixed(1)}%) es alta y el margen a cuotas no supera al de contado: considera subir el recargo_cuotas.`;
    } else if (tasaMora < 0.05 && margenCuotas > margenContado) {
      sugerencia = `La mora es baja (${(tasaMora * 100).toFixed(1)}%) y el margen a cuotas ya supera al de contado: el recargo actual podria bajarse sin perder rentabilidad.`;
    } else {
      sugerencia = `El recargo actual parece razonable dado el margen (contado ${(margenContado * 100).toFixed(1)}% vs cuotas ${(margenCuotas * 100).toFixed(1)}%) y la mora (${(tasaMora * 100).toFixed(1)}%).`;
    }
  }

  return { porMedioPago, tasaMora, sugerencia };
}

// 8. Cartera de cuotas: pendientes/atrasadas, total por cobrar, proximos vencimientos.
export async function carteraCuotas() {
  await marcarAtrasadas();

  const resumen = await prisma.$queryRaw<{ estado: string; cantidad: number; total: string }[]>`
    SELECT estado::text AS estado, COUNT(*)::int AS cantidad, SUM(valor_cuota)::numeric(14,2)::text AS total
    FROM cuotas
    WHERE estado IN ('pendiente', 'atrasada')
    GROUP BY estado
  `;

  const en30Dias = new Date();
  en30Dias.setDate(en30Dias.getDate() + 30);

  const proximosVencimientos = await prisma.cuota.findMany({
    where: { estado: "pendiente", fechaVencimiento: { lte: en30Dias } },
    include: { venta: { include: { comprador: true } } },
    orderBy: { fechaVencimiento: "asc" },
  });

  return { resumen, proximosVencimientos };
}

// 9. Stock muerto: productos sin ventas en los ultimos N dias.
export async function stockMuerto(dias: number) {
  const desde = new Date();
  desde.setDate(desde.getDate() - dias);

  return prisma.$queryRaw<
    { codigo: string; nombre: string; stockActual: number; ultimaVenta: Date | null }[]
  >`
    SELECT p.codigo, p.nombre, p.stock_actual AS "stockActual", MAX(v.fecha_venta) AS "ultimaVenta"
    FROM productos p
    LEFT JOIN ventas v ON v.codigo_producto = p.codigo
    WHERE p.stock_actual > 0
    GROUP BY p.codigo, p.nombre, p.stock_actual
    HAVING MAX(v.fecha_venta) IS NULL OR MAX(v.fecha_venta) < ${desde}
    ORDER BY "ultimaVenta" ASC NULLS FIRST
  `;
}

// 10. Historial de costos por proveedor: variacion de valor_compra_unitario en el tiempo.
export async function historialCostosProveedor() {
  const compras = await prisma.compraInventario.findMany({
    where: { proveedor: { not: null } },
    orderBy: [{ proveedor: "asc" }, { fechaCompra: "asc" }],
    select: {
      proveedor: true,
      codigoProducto: true,
      valorCompraUnitario: true,
      fechaCompra: true,
    },
  });

  const porProveedor = new Map<string, typeof compras>();
  for (const compra of compras) {
    const proveedor = compra.proveedor as string;
    const lista = porProveedor.get(proveedor) ?? [];
    lista.push(compra);
    porProveedor.set(proveedor, lista);
  }

  return Array.from(porProveedor.entries()).map(([proveedor, historico]) => ({
    proveedor,
    historico,
  }));
}
