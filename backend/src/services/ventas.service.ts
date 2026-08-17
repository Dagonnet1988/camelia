import { Prisma } from "../generated/prisma/client";
import type { Canal, FrecuenciaCuotas, MedioPago } from "../generated/prisma/enums";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/http";
import { comoBogota } from "../lib/fecha-bogota";
import { costoUltimaCompra } from "./compras.service";

const DIAS_POR_FRECUENCIA: Record<FrecuenciaCuotas, number> = {
  semanal: 7,
  quincenal: 15,
  mensual: 30,
};

export interface CompradorNuevoInput {
  nombre: string;
}

export interface LineaVentaInput {
  codigoProducto: string;
  cantidad: number;
  valorUnitario?: number; // default: producto.valorVenta
}

export interface RegistrarVentaInput {
  items: LineaVentaInput[];
  compradorCelular?: string;
  medioPago: MedioPago;
  numCuotas?: number;
  frecuenciaCuotas?: FrecuenciaCuotas;
  canal: Canal;
  fechaVenta?: Date;
  vendedorId?: number;
  // Si compradorCelular no existe todavia, se usa esto para crearlo de una vez (alta desde Ventas).
  compradorNuevo?: CompradorNuevoInput;
}

export interface LineaVentaEdicionInput {
  id?: number; // presente = linea existente que se ajusta; ausente = linea nueva
  codigoProducto: string;
  cantidad: number;
  valorUnitario: number;
}

export interface ActualizarVentaInput {
  items: LineaVentaEdicionInput[];
  compradorCelular?: string;
  compradorNuevo?: CompradorNuevoInput;
  medioPago: MedioPago;
  numCuotas?: number;
  frecuenciaCuotas?: FrecuenciaCuotas;
  recargoCuotas?: number;
  canal: Canal;
  vendedorId?: number;
}

export interface FiltrosVentas {
  codigoProducto?: string;
  compradorCelular?: string;
  canal?: Canal;
  vendedorId?: number;
  desde?: Date;
  hasta?: Date;
}

const INCLUDE_VENTA = {
  items: { include: { producto: true } },
  cuotas: true,
  vendedor: { select: { id: true, nombre: true, apellido: true } },
} satisfies Prisma.VentaInclude;

export function listarVentas(filtros: FiltrosVentas) {
  return prisma.venta.findMany({
    where: {
      items: filtros.codigoProducto ? { some: { codigoProducto: filtros.codigoProducto } } : undefined,
      compradorCelular: filtros.compradorCelular,
      canal: filtros.canal,
      vendedorId: filtros.vendedorId,
      fechaVenta: {
        gte: filtros.desde,
        lte: filtros.hasta,
      },
    },
    include: INCLUDE_VENTA,
    orderBy: { fechaVenta: "desc" },
  });
}

export async function obtenerVenta(id: number) {
  const venta = await prisma.venta.findUnique({ where: { id }, include: INCLUDE_VENTA });
  if (!venta) throw new ApiError(404, `Venta ${id} no existe`);
  return venta;
}

function validarCamposCuotas(
  medioPago: MedioPago,
  numCuotas: number | undefined,
  frecuenciaCuotas: FrecuenciaCuotas | undefined,
): void {
  if (medioPago !== "cuotas") return;
  if (!numCuotas || numCuotas < 1 || numCuotas > 3) {
    throw new ApiError(400, "num_cuotas es requerido y debe estar entre 1 y 3 para ventas a cuotas");
  }
  if (!frecuenciaCuotas) {
    throw new ApiError(400, "frecuencia_cuotas es requerida para ventas a cuotas");
  }
}

// Suma la cantidad por producto entre varias lineas - el mismo producto puede aparecer en mas
// de una linea (ej. mismo articulo a dos precios distintos), y el stock se valida/descuenta
// una sola vez por producto, no por linea.
function agruparCantidadPorProducto(items: { codigoProducto: string; cantidad: number }[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const item of items) {
    mapa.set(item.codigoProducto, (mapa.get(item.codigoProducto) ?? 0) + item.cantidad);
  }
  return mapa;
}

async function registrarVentaEnTx(tx: Prisma.TransactionClient, input: RegistrarVentaInput) {
  if (input.items.length === 0) throw new ApiError(400, "La venta debe tener al menos un producto");

  const fechaVenta = comoBogota(input.fechaVenta ?? new Date());
  const cantidadPorProducto = agruparCantidadPorProducto(input.items);

  const productos = new Map<string, Prisma.ProductoGetPayload<{}>>();
  for (const [codigo, cantidadTotal] of cantidadPorProducto) {
    const producto = await tx.producto.findUnique({ where: { codigo } });
    if (!producto) throw new ApiError(404, `Producto ${codigo} no existe`);
    if (producto.stockActual < cantidadTotal) {
      throw new ApiError(
        400,
        `Stock insuficiente para ${codigo}: disponible ${producto.stockActual}, solicitado ${cantidadTotal}`,
      );
    }
    productos.set(codigo, producto);
  }

  if (input.compradorCelular) {
    const comprador = await tx.comprador.findUnique({ where: { celular: input.compradorCelular } });
    if (!comprador) {
      if (!input.compradorNuevo) {
        throw new ApiError(
          404,
          `Comprador ${input.compradorCelular} no existe. Incluye compradorNuevo (nombre) para crearlo con esta venta.`,
        );
      }
      await tx.comprador.create({
        data: {
          celular: input.compradorCelular,
          nombre: input.compradorNuevo.nombre,
          fechaPrimeraCompra: fechaVenta,
        },
      });
    }
  }

  const vendedor = input.vendedorId ? await tx.usuario.findUnique({ where: { id: input.vendedorId } }) : null;

  // El recargo por cuotas parte del valor global configurado en Comisiones; se puede ajustar
  // despues por venta individual desde la edicion (ver actualizarVenta).
  const config = input.medioPago === "cuotas" ? await tx.configuracionApp.findUnique({ where: { id: 1 } }) : null;
  const recargoCuotas = config?.recargoCuotasGlobal ?? new Prisma.Decimal(0);

  // El nombre del campo (costo_unitario_al_momento) es historico: la ganancia se calcula con el
  // costo de la compra mas reciente del producto, no con el promedio ponderado (pedido explicito
  // del usuario - el promedio "no refleja lo que realmente costo ese stock"). Si el producto no
  // tiene ninguna compra registrada (no deberia pasar, todo producto nace de una Compra), cae de
  // vuelta al promedio ponderado solo para no dejar la linea sin costo.
  const lineas: {
    codigoProducto: string;
    cantidad: number;
    valorUnitario: Prisma.Decimal;
    costoUnitarioAlMomento: Prisma.Decimal;
    ganancia: Prisma.Decimal;
  }[] = [];
  for (const item of input.items) {
    const producto = productos.get(item.codigoProducto)!;
    const cantidad = new Prisma.Decimal(item.cantidad);
    const valorUnitario =
      item.valorUnitario !== undefined ? new Prisma.Decimal(item.valorUnitario) : producto.valorVenta;
    const costoUnitarioAlMomento = (await costoUltimaCompra(tx, item.codigoProducto)) ?? producto.costoPromedio;
    const gananciaLinea = valorUnitario.sub(costoUnitarioAlMomento).mul(cantidad);
    lineas.push({
      codigoProducto: item.codigoProducto,
      cantidad: item.cantidad,
      valorUnitario,
      costoUnitarioAlMomento,
      ganancia: gananciaLinea,
    });
  }

  const valorContado = lineas.reduce((acc, l) => acc.add(l.valorUnitario.mul(l.cantidad)), new Prisma.Decimal(0));
  const valorTotalVenta = valorContado.add(recargoCuotas);
  const ganancia = lineas.reduce((acc, l) => acc.add(l.ganancia), new Prisma.Decimal(0));
  const comisionPorcentaje = vendedor?.porcentajeComision ?? new Prisma.Decimal(0);
  const comision = valorTotalVenta.mul(comisionPorcentaje).div(100);

  for (const [codigo, cantidadTotal] of cantidadPorProducto) {
    await tx.producto.update({ where: { codigo }, data: { stockActual: { decrement: cantidadTotal } } });
  }

  const venta = await tx.venta.create({
    data: {
      compradorCelular: input.compradorCelular,
      valorContado,
      medioPago: input.medioPago,
      numCuotas: input.medioPago === "cuotas" ? input.numCuotas : null,
      frecuenciaCuotas: input.medioPago === "cuotas" ? input.frecuenciaCuotas : null,
      recargoCuotas: input.medioPago === "cuotas" ? recargoCuotas : null,
      valorTotalVenta,
      ganancia,
      canal: input.canal,
      fechaVenta,
      vendedorId: input.vendedorId,
      comisionPorcentaje,
      comision,
      items: { create: lineas },
    },
  });

  if (input.medioPago === "cuotas" && input.numCuotas && input.frecuenciaCuotas) {
    await tx.cuota.createMany({
      data: generarCuotas(venta.id, valorTotalVenta, input.numCuotas, input.frecuenciaCuotas, fechaVenta),
    });
  }

  return tx.venta.findUniqueOrThrow({ where: { id: venta.id }, include: INCLUDE_VENTA });
}

export async function registrarVenta(input: RegistrarVentaInput) {
  validarCamposCuotas(input.medioPago, input.numCuotas, input.frecuenciaCuotas);
  return prisma.$transaction((tx) => registrarVentaEnTx(tx, input));
}

export async function actualizarVenta(id: number, input: ActualizarVentaInput) {
  validarCamposCuotas(input.medioPago, input.numCuotas, input.frecuenciaCuotas);
  if (input.medioPago === "cuotas" && input.recargoCuotas === undefined) {
    throw new ApiError(400, "recargo_cuotas es requerido para ventas a cuotas");
  }
  if (input.items.length === 0) throw new ApiError(400, "La venta debe tener al menos un producto");

  return prisma.$transaction(async (tx) => {
    const existente = await tx.venta.findUnique({ where: { id }, include: { cuotas: true, items: true } });
    if (!existente) throw new ApiError(404, `Venta ${id} no existe`);
    if (existente.comisionEstado === "liquidada") {
      throw new ApiError(400, "No se puede editar una venta cuya comision ya fue liquidada");
    }
    if (existente.cuotas.some((c) => c.estado === "pagada")) {
      throw new ApiError(400, "No se puede editar una venta que ya tiene cuotas pagadas");
    }

    const idsExistentes = new Set(existente.items.map((i) => i.id));
    for (const item of input.items) {
      if (item.id !== undefined && !idsExistentes.has(item.id)) {
        throw new ApiError(400, `La linea ${item.id} no pertenece a esta venta`);
      }
    }

    // Stock por diferencia AGREGADA por producto (no por linea) - evita bugs de aritmetica
    // cuando un producto se mueve entre lineas o queda duplicado en el mismo pedido.
    const cantidadViejaPorProducto = agruparCantidadPorProducto(existente.items);
    const cantidadNuevaPorProducto = agruparCantidadPorProducto(input.items);
    const productosAfectados = new Set([...cantidadViejaPorProducto.keys(), ...cantidadNuevaPorProducto.keys()]);

    const productos = new Map<string, Prisma.ProductoGetPayload<{}>>();
    const stockFinalPorProducto = new Map<string, number>();
    for (const codigo of productosAfectados) {
      const producto = await tx.producto.findUnique({ where: { codigo } });
      if (!producto) throw new ApiError(404, `Producto ${codigo} no existe`);
      const stockFinal =
        producto.stockActual + (cantidadViejaPorProducto.get(codigo) ?? 0) - (cantidadNuevaPorProducto.get(codigo) ?? 0);
      if (stockFinal < 0) {
        throw new ApiError(400, `Stock insuficiente para ${codigo}: la edicion lo dejaria en ${stockFinal}`);
      }
      productos.set(codigo, producto);
      stockFinalPorProducto.set(codigo, stockFinal);
    }

    if (input.compradorCelular) {
      const comprador = await tx.comprador.findUnique({ where: { celular: input.compradorCelular } });
      if (!comprador) {
        if (!input.compradorNuevo) {
          throw new ApiError(
            404,
            `Comprador ${input.compradorCelular} no existe. Incluye compradorNuevo (nombre) para crearlo con esta venta.`,
          );
        }
        await tx.comprador.create({
          data: {
            celular: input.compradorCelular,
            nombre: input.compradorNuevo.nombre,
            fechaPrimeraCompra: existente.fechaVenta,
          },
        });
      }
    }

    const vendedorIdEfectivo = input.vendedorId !== undefined ? input.vendedorId : existente.vendedorId;
    const vendedor = vendedorIdEfectivo ? await tx.usuario.findUnique({ where: { id: vendedorIdEfectivo } }) : null;

    // A diferencia de la creacion, en la edicion el recargo lo decide quien edita (no se vuelve
    // a tomar del global) - permite ajustarlo caso a caso sin romper el calculo de cuotas.
    const recargoCuotas =
      input.medioPago === "cuotas" ? new Prisma.Decimal(input.recargoCuotas as number) : new Prisma.Decimal(0);

    const itemsExistentesPorId = new Map(existente.items.map((i) => [i.id, i]));
    const lineas: {
      codigoProducto: string;
      cantidad: number;
      valorUnitario: Prisma.Decimal;
      costoUnitarioAlMomento: Prisma.Decimal;
      ganancia: Prisma.Decimal;
    }[] = [];
    for (const item of input.items) {
      const producto = productos.get(item.codigoProducto)!;
      const cantidad = new Prisma.Decimal(item.cantidad);
      const valorUnitario = new Prisma.Decimal(item.valorUnitario);
      const lineaExistente = item.id !== undefined ? itemsExistentesPorId.get(item.id) : undefined;
      // Preserva el costo historico si la linea ya existia (misma logica que antes con
      // costoPromedioAlMomento - la ganancia historica no se recalcula con costos actuales);
      // una linea realmente nueva (sin id, o con un producto que no estaba antes) calcula costo
      // fresco igual que en la creacion.
      const costoUnitarioAlMomento = lineaExistente
        ? lineaExistente.costoUnitarioAlMomento
        : ((await costoUltimaCompra(tx, item.codigoProducto)) ?? producto.costoPromedio);
      const gananciaLinea = valorUnitario.sub(costoUnitarioAlMomento).mul(cantidad);
      lineas.push({
        codigoProducto: item.codigoProducto,
        cantidad: item.cantidad,
        valorUnitario,
        costoUnitarioAlMomento,
        ganancia: gananciaLinea,
      });
    }

    const valorContado = lineas.reduce((acc, l) => acc.add(l.valorUnitario.mul(l.cantidad)), new Prisma.Decimal(0));
    const valorTotalVenta = valorContado.add(recargoCuotas);
    const ganancia = lineas.reduce((acc, l) => acc.add(l.ganancia), new Prisma.Decimal(0));
    const comisionPorcentaje = vendedor?.porcentajeComision ?? new Prisma.Decimal(0);
    const comision = valorTotalVenta.mul(comisionPorcentaje).div(100);

    for (const [codigo, stockFinal] of stockFinalPorProducto) {
      await tx.producto.update({ where: { codigo }, data: { stockActual: stockFinal } });
    }

    await tx.cuota.deleteMany({ where: { idVenta: id } });
    await tx.ventaItem.deleteMany({ where: { ventaId: id } });

    await tx.venta.update({
      where: { id },
      data: {
        compradorCelular: input.compradorCelular || null,
        valorContado,
        medioPago: input.medioPago,
        numCuotas: input.medioPago === "cuotas" ? input.numCuotas : null,
        frecuenciaCuotas: input.medioPago === "cuotas" ? input.frecuenciaCuotas : null,
        recargoCuotas: input.medioPago === "cuotas" ? recargoCuotas : null,
        valorTotalVenta,
        ganancia,
        canal: input.canal,
        vendedorId: vendedorIdEfectivo,
        comisionPorcentaje,
        comision,
        items: { create: lineas },
      },
    });

    if (input.medioPago === "cuotas" && input.numCuotas && input.frecuenciaCuotas) {
      await tx.cuota.createMany({
        data: generarCuotas(id, valorTotalVenta, input.numCuotas, input.frecuenciaCuotas, existente.fechaVenta),
      });
    }

    return tx.venta.findUniqueOrThrow({ where: { id }, include: INCLUDE_VENTA });
  });
}

// Solo admin (ver ventas.routes.ts). Mismo guard que actualizarVenta - no se puede borrar una
// venta cuya comision ya fue liquidada, ni una con alguna cuota ya pagada (perderia el
// historial real de cobro). Revierte el stock descontado (agregado por producto - el mismo
// producto puede estar en varias lineas) y borra las cuotas antes de la venta (no hay
// onDelete: Cascade en esa relacion); las lineas (VentaItem) se borran solas por cascada al
// borrar la venta. Todo en una sola transaccion.
export async function eliminarVenta(id: number) {
  return prisma.$transaction(async (tx) => {
    const existente = await tx.venta.findUnique({ where: { id }, include: { cuotas: true, items: true } });
    if (!existente) throw new ApiError(404, `Venta ${id} no existe`);
    if (existente.comisionEstado === "liquidada") {
      throw new ApiError(400, "No se puede eliminar una venta cuya comision ya fue liquidada");
    }
    if (existente.cuotas.some((c) => c.estado === "pagada")) {
      throw new ApiError(400, "No se puede eliminar una venta que ya tiene cuotas pagadas");
    }

    const cantidadPorProducto = agruparCantidadPorProducto(existente.items);

    await tx.cuota.deleteMany({ where: { idVenta: id } });
    for (const [codigo, cantidad] of cantidadPorProducto) {
      await tx.producto.update({ where: { codigo }, data: { stockActual: { increment: cantidad } } });
    }
    await tx.venta.delete({ where: { id } });
  });
}

function generarCuotas(
  idVenta: number,
  valorTotalVenta: Prisma.Decimal,
  numCuotas: number,
  frecuencia: FrecuenciaCuotas,
  fechaVenta: Date,
) {
  const diasEntreCuotas = DIAS_POR_FRECUENCIA[frecuencia];
  // Cada cuota (salvo la ultima) se redondea a la centena mas cercana para que el valor a
  // cobrar sea un monto "redondo"; la ultima cuota absorbe la diferencia de redondeo para que
  // la suma de todas las cuotas siga cuadrando exacto con valorTotalVenta.
  const valorBase = valorTotalVenta.div(numCuotas).toNearest(100);
  const cuotas = [];
  let acumulado = new Prisma.Decimal(0);

  for (let numero = 1; numero <= numCuotas; numero++) {
    const esUltima = numero === numCuotas;
    const valorCuota = esUltima ? valorTotalVenta.sub(acumulado) : valorBase;
    acumulado = acumulado.add(valorCuota);

    // fechaVenta ya viene desplazada por comoBogota() - sus componentes reales viven en los
    // getters/setters UTC, no en los locales (ver fecha-bogota.ts).
    const fechaVencimiento = new Date(fechaVenta);
    fechaVencimiento.setUTCDate(fechaVencimiento.getUTCDate() + diasEntreCuotas * numero);

    cuotas.push({
      idVenta,
      numeroCuota: numero,
      valorCuota,
      fechaVencimiento,
    });
  }

  return cuotas;
}
