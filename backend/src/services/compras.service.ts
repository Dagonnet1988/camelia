import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/http";

export interface ProductoNuevoInput {
  nombre: string;
  categoria: string;
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

export interface ActualizarCompraInput {
  codigoProducto?: string;
  cantidad: number;
  valorCompraUnitario: number;
  proveedor?: string;
  fechaCompra: Date;
}

export interface LineaCompraLote {
  codigoProducto: string;
  cantidad: number;
  valorCompraUnitario: number;
  productoNuevo?: ProductoNuevoInput;
}

export interface RegistrarCompraLoteInput {
  proveedor?: string;
  fechaCompra?: Date;
  lineas: LineaCompraLote[];
}

export function listarCompras(codigoProducto?: string) {
  return prisma.compraInventario.findMany({
    where: codigoProducto ? { codigoProducto } : undefined,
    orderBy: [{ producto: { nombre: "asc" } }, { fechaCompra: "desc" }],
  });
}

/** Costo de la compra mas reciente de un producto (o null si nunca se le ha comprado). */
export async function costoUltimaCompra(tx: Prisma.TransactionClient, codigoProducto: string) {
  const ultima = await tx.compraInventario.findFirst({
    where: { codigoProducto },
    orderBy: [{ fechaCompra: "desc" }, { id: "desc" }],
    select: { valorCompraUnitario: true },
  });
  return ultima?.valorCompraUnitario ?? null;
}

async function registrarCompraEnTx(tx: Prisma.TransactionClient, input: RegistrarCompraInput) {
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
        // El producto hereda el proveedor de esta primera compra - dato propio del producto,
        // editable despues desde Productos (distinto del proveedor historico por compra).
        proveedor: input.proveedor,
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
}

export async function registrarCompra(input: RegistrarCompraInput) {
  return prisma.$transaction((tx) => registrarCompraEnTx(tx, input));
}

/** Compra por lote: un proveedor/fecha compartidos, muchas lineas (productos) en una sola
 * transaccion - o se registran todas, o ninguna. Reutiliza registrarCompraEnTx por linea. */
export async function registrarCompraLote(input: RegistrarCompraLoteInput) {
  return prisma.$transaction(async (tx) => {
    const resultados = [];
    for (const linea of input.lineas) {
      resultados.push(
        await registrarCompraEnTx(tx, {
          codigoProducto: linea.codigoProducto,
          cantidad: linea.cantidad,
          valorCompraUnitario: linea.valorCompraUnitario,
          proveedor: input.proveedor,
          fechaCompra: input.fechaCompra,
          productoNuevo: linea.productoNuevo,
        }),
      );
    }
    return resultados;
  });
}

// A diferencia de registrarCompra (que suma incrementalmente sobre el costo actual, correcto
// porque una compra nueva siempre es la mas reciente), editar una compra puede cambiar
// cantidad/valor/fecha/producto de cualquier punto de la historia - el costo promedio ponderado
// depende del orden, asi que se recalcula desde cero repasando TODAS las compras del producto
// en orden cronologico.
async function recalcularProducto(tx: Prisma.TransactionClient, codigoProducto: string) {
  const compras = await tx.compraInventario.findMany({
    where: { codigoProducto },
    orderBy: [{ fechaCompra: "asc" }, { id: "asc" }],
  });

  let stock = 0;
  let costo = new Prisma.Decimal(0);
  for (const c of compras) {
    costo =
      stock === 0
        ? c.valorCompraUnitario
        : new Prisma.Decimal(stock)
            .mul(costo)
            .add(new Prisma.Decimal(c.cantidad).mul(c.valorCompraUnitario))
            .div(stock + c.cantidad);
    stock += c.cantidad;
  }

  const ventasAgregado = await tx.ventaItem.aggregate({
    where: { codigoProducto },
    _sum: { cantidad: true },
  });
  const stockFinal = stock - (ventasAgregado._sum.cantidad ?? 0);

  if (stockFinal < 0) {
    throw new ApiError(
      400,
      `Este cambio dejaría el stock de ${codigoProducto} en negativo (ya se vendieron más unidades de las que quedarían compradas)`,
    );
  }

  await tx.producto.update({
    where: { codigo: codigoProducto },
    data: { stockActual: stockFinal, costoPromedio: costo },
  });
}

export async function actualizarCompra(id: number, input: ActualizarCompraInput) {
  return prisma.$transaction(async (tx) => {
    const existente = await tx.compraInventario.findUnique({ where: { id } });
    if (!existente) throw new ApiError(404, `Compra ${id} no existe`);

    const nuevoCodigoProducto = input.codigoProducto ?? existente.codigoProducto;
    if (nuevoCodigoProducto !== existente.codigoProducto) {
      const productoDestino = await tx.producto.findUnique({ where: { codigo: nuevoCodigoProducto } });
      if (!productoDestino) throw new ApiError(404, `Producto ${nuevoCodigoProducto} no existe`);
    }

    await tx.compraInventario.update({
      where: { id },
      data: {
        codigoProducto: nuevoCodigoProducto,
        cantidad: input.cantidad,
        valorCompraUnitario: input.valorCompraUnitario,
        proveedor: input.proveedor,
        fechaCompra: input.fechaCompra,
      },
    });

    await recalcularProducto(tx, existente.codigoProducto);
    if (nuevoCodigoProducto !== existente.codigoProducto) {
      await recalcularProducto(tx, nuevoCodigoProducto);
    }

    return tx.compraInventario.findUniqueOrThrow({ where: { id } });
  });
}
