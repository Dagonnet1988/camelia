import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/http";

export interface RegistrarCompraInput {
  codigoProducto: string;
  cantidad: number;
  valorCompraUnitario: number;
  proveedor?: string;
  fechaCompra?: Date;
}

export function listarCompras(codigoProducto?: string) {
  return prisma.compraInventario.findMany({
    where: codigoProducto ? { codigoProducto } : undefined,
    orderBy: { fechaCompra: "desc" },
  });
}

export async function registrarCompra(input: RegistrarCompraInput) {
  return prisma.$transaction(async (tx) => {
    const producto = await tx.producto.findUnique({ where: { codigo: input.codigoProducto } });
    if (!producto) throw new ApiError(404, `Producto ${input.codigoProducto} no existe`);

    const stockPrevio = producto.stockActual;
    const costoPrevio = producto.costoPromedio;
    const cantidad = new Prisma.Decimal(input.cantidad);
    const valorCompraUnitario = new Prisma.Decimal(input.valorCompraUnitario);

    const stockNuevo = stockPrevio + input.cantidad;
    const costoNuevo = stockNuevo === 0
      ? new Prisma.Decimal(0)
      : costoPrevio
          .mul(stockPrevio)
          .add(cantidad.mul(valorCompraUnitario))
          .div(stockNuevo);

    await tx.producto.update({
      where: { codigo: input.codigoProducto },
      data: {
        stockActual: stockNuevo,
        costoPromedio: costoNuevo,
      },
    });

    return tx.compraInventario.create({
      data: {
        codigoProducto: input.codigoProducto,
        cantidad: input.cantidad,
        valorCompraUnitario: input.valorCompraUnitario,
        proveedor: input.proveedor,
        ...(input.fechaCompra ? { fechaCompra: input.fechaCompra } : {}),
      },
    });
  });
}
