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

export interface RegistrarVentaInput {
  codigoProducto: string;
  compradorCelular?: string;
  cantidad: number;
  valorContado?: number;
  medioPago: MedioPago;
  numCuotas?: number;
  frecuenciaCuotas?: FrecuenciaCuotas;
  canal: Canal;
  fechaVenta?: Date;
  vendedorId?: number;
  // Si compradorCelular no existe todavia, se usa esto para crearlo de una vez (alta desde Ventas).
  compradorNuevo?: CompradorNuevoInput;
}

export interface ActualizarVentaInput {
  compradorCelular?: string;
  compradorNuevo?: CompradorNuevoInput;
  cantidad: number;
  valorContado: number;
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

export function listarVentas(filtros: FiltrosVentas) {
  return prisma.venta.findMany({
    where: {
      codigoProducto: filtros.codigoProducto,
      compradorCelular: filtros.compradorCelular,
      canal: filtros.canal,
      vendedorId: filtros.vendedorId,
      fechaVenta: {
        gte: filtros.desde,
        lte: filtros.hasta,
      },
    },
    include: { cuotas: true, vendedor: { select: { id: true, nombre: true, apellido: true } } },
    orderBy: { fechaVenta: "desc" },
  });
}

export async function obtenerVenta(id: number) {
  const venta = await prisma.venta.findUnique({
    where: { id },
    include: { cuotas: true, vendedor: { select: { id: true, nombre: true, apellido: true } } },
  });
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

export async function registrarVenta(input: RegistrarVentaInput) {
  validarCamposCuotas(input.medioPago, input.numCuotas, input.frecuenciaCuotas);

  return prisma.$transaction(async (tx) => {
    const producto = await tx.producto.findUnique({ where: { codigo: input.codigoProducto } });
    if (!producto) throw new ApiError(404, `Producto ${input.codigoProducto} no existe`);
    if (producto.stockActual < input.cantidad) {
      throw new ApiError(400, `Stock insuficiente para ${input.codigoProducto}: disponible ${producto.stockActual}, solicitado ${input.cantidad}`);
    }

    const fechaVenta = comoBogota(input.fechaVenta ?? new Date());

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

    const vendedor = input.vendedorId
      ? await tx.usuario.findUnique({ where: { id: input.vendedorId } })
      : null;

    // El recargo por cuotas parte del valor global configurado en Comisiones; se puede
    // ajustar despues por venta individual desde la edicion (ver actualizarVenta).
    const config = input.medioPago === "cuotas" ? await tx.configuracionApp.findUnique({ where: { id: 1 } }) : null;
    const cantidad = new Prisma.Decimal(input.cantidad);
    const recargoCuotas = config?.recargoCuotasGlobal ?? new Prisma.Decimal(0);
    const valorContado =
      input.valorContado !== undefined ? new Prisma.Decimal(input.valorContado) : producto.valorVenta.mul(cantidad);
    const valorTotalVenta = valorContado.add(recargoCuotas);
    // El nombre del campo (costo_promedio_al_momento) es historico: la ganancia se calcula con
    // el costo de la compra mas reciente del producto, no con el promedio ponderado (pedido
    // explicito del usuario - el promedio "no refleja lo que realmente costo ese stock"). Si el
    // producto no tiene ninguna compra registrada (no deberia pasar, todo producto nace de una
    // Compra), cae de vuelta al promedio ponderado solo para no dejar la venta sin costo.
    const costoPromedioAlMomento = (await costoUltimaCompra(tx, input.codigoProducto)) ?? producto.costoPromedio;
    const ganancia = valorTotalVenta.sub(costoPromedioAlMomento.mul(cantidad));
    const comisionPorcentaje = vendedor?.porcentajeComision ?? new Prisma.Decimal(0);
    const comision = valorTotalVenta.mul(comisionPorcentaje).div(100);

    await tx.producto.update({
      where: { codigo: input.codigoProducto },
      data: { stockActual: { decrement: input.cantidad } },
    });

    const venta = await tx.venta.create({
      data: {
        codigoProducto: input.codigoProducto,
        compradorCelular: input.compradorCelular,
        cantidad: input.cantidad,
        valorContado,
        medioPago: input.medioPago,
        numCuotas: input.medioPago === "cuotas" ? input.numCuotas : null,
        frecuenciaCuotas: input.medioPago === "cuotas" ? input.frecuenciaCuotas : null,
        recargoCuotas: input.medioPago === "cuotas" ? recargoCuotas : null,
        valorTotalVenta,
        costoPromedioAlMomento,
        ganancia,
        canal: input.canal,
        fechaVenta,
        vendedorId: input.vendedorId,
        comisionPorcentaje,
        comision,
      },
    });

    if (input.medioPago === "cuotas" && input.numCuotas && input.frecuenciaCuotas) {
      await tx.cuota.createMany({
        data: generarCuotas(venta.id, valorTotalVenta, input.numCuotas, input.frecuenciaCuotas, fechaVenta),
      });
    }

    return tx.venta.findUniqueOrThrow({
      where: { id: venta.id },
      include: { cuotas: true, vendedor: { select: { id: true, nombre: true, apellido: true } } },
    });
  });
}

export async function actualizarVenta(id: number, input: ActualizarVentaInput) {
  validarCamposCuotas(input.medioPago, input.numCuotas, input.frecuenciaCuotas);
  if (input.medioPago === "cuotas" && input.recargoCuotas === undefined) {
    throw new ApiError(400, "recargo_cuotas es requerido para ventas a cuotas");
  }

  return prisma.$transaction(async (tx) => {
    const existente = await tx.venta.findUnique({ where: { id }, include: { cuotas: true } });
    if (!existente) throw new ApiError(404, `Venta ${id} no existe`);
    if (existente.comisionEstado === "liquidada") {
      throw new ApiError(400, "No se puede editar una venta cuya comision ya fue liquidada");
    }
    if (existente.cuotas.some((c) => c.estado === "pagada")) {
      throw new ApiError(400, "No se puede editar una venta que ya tiene cuotas pagadas");
    }

    const producto = await tx.producto.findUniqueOrThrow({ where: { codigo: existente.codigoProducto } });
    const stockDisponible = producto.stockActual + existente.cantidad;
    if (stockDisponible < input.cantidad) {
      throw new ApiError(
        400,
        `Stock insuficiente para ${existente.codigoProducto}: disponible ${stockDisponible}, solicitado ${input.cantidad}`,
      );
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
    const vendedor = vendedorIdEfectivo
      ? await tx.usuario.findUnique({ where: { id: vendedorIdEfectivo } })
      : null;

    // A diferencia de la creacion, en la edicion el recargo lo decide quien edita (no se
    // vuelve a tomar del global) - permite ajustarlo caso a caso sin romper el calculo de cuotas.
    const cantidad = new Prisma.Decimal(input.cantidad);
    const recargoCuotas =
      input.medioPago === "cuotas" ? new Prisma.Decimal(input.recargoCuotas as number) : new Prisma.Decimal(0);
    const valorContado = new Prisma.Decimal(input.valorContado);
    const valorTotalVenta = valorContado.add(recargoCuotas);
    // costoPromedioAlMomento se conserva del valor original: la ganancia historica no se
    // distorsiona aunque el costo promedio del producto haya cambiado desde esta venta.
    const costoPromedioAlMomento = existente.costoPromedioAlMomento;
    const ganancia = valorTotalVenta.sub(costoPromedioAlMomento.mul(cantidad));
    const comisionPorcentaje = vendedor?.porcentajeComision ?? new Prisma.Decimal(0);
    const comision = valorTotalVenta.mul(comisionPorcentaje).div(100);

    await tx.producto.update({
      where: { codigo: existente.codigoProducto },
      data: { stockActual: stockDisponible - input.cantidad },
    });

    await tx.cuota.deleteMany({ where: { idVenta: id } });

    await tx.venta.update({
      where: { id },
      data: {
        compradorCelular: input.compradorCelular || null,
        cantidad: input.cantidad,
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
      },
    });

    if (input.medioPago === "cuotas" && input.numCuotas && input.frecuenciaCuotas) {
      await tx.cuota.createMany({
        data: generarCuotas(id, valorTotalVenta, input.numCuotas, input.frecuenciaCuotas, existente.fechaVenta),
      });
    }

    return tx.venta.findUniqueOrThrow({
      where: { id },
      include: { cuotas: true, vendedor: { select: { id: true, nombre: true, apellido: true } } },
    });
  });
}

// Solo admin (ver ventas.routes.ts). Mismo guard que actualizarVenta - no se puede borrar una
// venta cuya comision ya fue liquidada, ni una con alguna cuota ya pagada (perderia el
// historial real de cobro). Revierte el stock descontado y borra las cuotas antes de la venta
// (no hay onDelete: Cascade en el schema) - todo en una sola transaccion.
export async function eliminarVenta(id: number) {
  return prisma.$transaction(async (tx) => {
    const existente = await tx.venta.findUnique({ where: { id }, include: { cuotas: true } });
    if (!existente) throw new ApiError(404, `Venta ${id} no existe`);
    if (existente.comisionEstado === "liquidada") {
      throw new ApiError(400, "No se puede eliminar una venta cuya comision ya fue liquidada");
    }
    if (existente.cuotas.some((c) => c.estado === "pagada")) {
      throw new ApiError(400, "No se puede eliminar una venta que ya tiene cuotas pagadas");
    }

    await tx.cuota.deleteMany({ where: { idVenta: id } });
    await tx.producto.update({
      where: { codigo: existente.codigoProducto },
      data: { stockActual: { increment: existente.cantidad } },
    });
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
