import { Prisma } from "../generated/prisma/client";
import type { CategoriaProducto } from "../generated/prisma/enums";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/http";

export interface ProductoNuevoInput {
  nombre: string;
  categoria: CategoriaProducto;
  valorVenta: number;
  stockMinimo?: number;
}

export interface RegistrarCompraInput {
  codigoProducto: string;
  cantidad: number;
  valorCompraUnitario: number;
  proveedor?: string;
  fechaCompra?: Date;
  // Si codigoProducto no existe todavia, se usa esto para crearlo de una vez (alta desde Compras).
  productoNuevo?: ProductoNuevoInput;
}

export function listarCompras(codigoProducto?: string) {
  return prisma.compraInventario.findMany({
    where: codigoProducto ? { codigoProducto } : undefined,
    orderBy: { fechaCompra: "desc" },
  });
}

export async function registrarCompra(input: RegistrarCompraInput) {
  return prisma.$transaction(async (tx) => {
    let producto = await tx.producto.findUnique({ where: { codigo: input.codigoProducto } });

    if (!producto) {
      if (!input.productoNuevo) {
        throw new ApiError(
          404,
          `Producto ${input.codigoProducto} no existe. Incluye productoNuevo (nombre, categoria, valorVenta) para crearlo con esta compra.`,
        );
      }
      producto = await tx.producto.create({
        data: {
          codigo: input.codigoProducto,
          nombre: input.productoNuevo.nombre,
          categoria: input.productoNuevo.categoria,
          valorVenta: input.productoNuevo.valorVenta,
          stockMinimo: input.productoNuevo.stockMinimo ?? 0,
        },
      });
    }

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
