import { Prisma } from "../generated/prisma/client";
import type { Canal, MedioPago } from "../generated/prisma/enums";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/http";

const DIAS_ENTRE_CUOTAS = 30;

export interface RegistrarVentaInput {
  codigoProducto: string;
  compradorCelular?: string;
  cantidad: number;
  medioPago: MedioPago;
  numCuotas?: number;
  recargoCuotas?: number;
  canal: Canal;
  fechaVenta?: Date;
}

export interface FiltrosVentas {
  codigoProducto?: string;
  compradorCelular?: string;
  canal?: Canal;
  desde?: Date;
  hasta?: Date;
}

export function listarVentas(filtros: FiltrosVentas) {
  return prisma.venta.findMany({
    where: {
      codigoProducto: filtros.codigoProducto,
      compradorCelular: filtros.compradorCelular,
      canal: filtros.canal,
      fechaVenta: {
        gte: filtros.desde,
        lte: filtros.hasta,
      },
    },
    include: { cuotas: true },
    orderBy: { fechaVenta: "desc" },
  });
}

export async function obtenerVenta(id: number) {
  const venta = await prisma.venta.findUnique({ where: { id }, include: { cuotas: true } });
  if (!venta) throw new ApiError(404, `Venta ${id} no existe`);
  return venta;
}

export async function registrarVenta(input: RegistrarVentaInput) {
  if (input.medioPago === "cuotas") {
    if (!input.numCuotas || input.numCuotas < 1 || input.numCuotas > 3) {
      throw new ApiError(400, "num_cuotas es requerido y debe estar entre 1 y 3 para ventas a cuotas");
    }
  }

  return prisma.$transaction(async (tx) => {
    const producto = await tx.producto.findUnique({ where: { codigo: input.codigoProducto } });
    if (!producto) throw new ApiError(404, `Producto ${input.codigoProducto} no existe`);
    if (producto.stockActual < input.cantidad) {
      throw new ApiError(400, `Stock insuficiente para ${input.codigoProducto}: disponible ${producto.stockActual}, solicitado ${input.cantidad}`);
    }

    if (input.compradorCelular) {
      const comprador = await tx.comprador.findUnique({ where: { celular: input.compradorCelular } });
      if (!comprador) throw new ApiError(404, `Comprador ${input.compradorCelular} no existe`);
    }

    const cantidad = new Prisma.Decimal(input.cantidad);
    const recargoCuotas = new Prisma.Decimal(input.recargoCuotas ?? 0);
    const valorContado = producto.valorVenta.mul(cantidad);
    const valorTotalVenta = valorContado.add(recargoCuotas);
    const costoPromedioAlMomento = producto.costoPromedio;
    const ganancia = valorTotalVenta.sub(costoPromedioAlMomento.mul(cantidad));
    const fechaVenta = input.fechaVenta ?? new Date();

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
        recargoCuotas: input.medioPago === "cuotas" ? recargoCuotas : null,
        valorTotalVenta,
        costoPromedioAlMomento,
        ganancia,
        canal: input.canal,
        fechaVenta,
      },
    });

    if (input.medioPago === "cuotas" && input.numCuotas) {
      await tx.cuota.createMany({
        data: generarCuotas(venta.id, valorTotalVenta, input.numCuotas, fechaVenta),
      });
    }

    return tx.venta.findUniqueOrThrow({ where: { id: venta.id }, include: { cuotas: true } });
  });
}

function generarCuotas(
  idVenta: number,
  valorTotalVenta: Prisma.Decimal,
  numCuotas: number,
  fechaVenta: Date,
) {
  const valorBase = valorTotalVenta.div(numCuotas).toDecimalPlaces(2);
  const cuotas = [];
  let acumulado = new Prisma.Decimal(0);

  for (let numero = 1; numero <= numCuotas; numero++) {
    const esUltima = numero === numCuotas;
    const valorCuota = esUltima ? valorTotalVenta.sub(acumulado) : valorBase;
    acumulado = acumulado.add(valorCuota);

    const fechaVencimiento = new Date(fechaVenta);
    fechaVencimiento.setDate(fechaVencimiento.getDate() + DIAS_ENTRE_CUOTAS * numero);

    cuotas.push({
      idVenta,
      numeroCuota: numero,
      valorCuota,
      fechaVencimiento,
    });
  }

  return cuotas;
}
