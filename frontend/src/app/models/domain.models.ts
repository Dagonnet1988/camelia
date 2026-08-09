// Texto libre (no es un enum fijo): el catalogo deriva las categorias disponibles de las que
// ya estan en uso entre los productos, no de una lista predefinida.
export type Categoria = string;
export type MedioPago = 'contado' | 'cuotas';
export type Canal = 'whatsapp' | 'presencial';
export type EstadoCuota = 'pendiente' | 'pagada' | 'atrasada';
export type FrecuenciaCuotas = 'semanal' | 'quincenal' | 'mensual';

export interface FotoProducto {
  id: number;
  codigoProducto: string;
  url: string;
  orden: number;
}

export interface Producto {
  codigo: string;
  nombre: string;
  categoria: Categoria;
  valorVenta: string;
  costoPromedio: string;
  stockActual: number;
  stockMinimo: number;
  fechaIngreso: string;
  proveedor: string | null;
  fotos: FotoProducto[];
}

export interface ProductoPublico {
  codigo: string;
  nombre: string;
  categoria: Categoria;
  valorVenta: string;
  fotos: { url: string }[];
}

export interface CrearProductoInput {
  codigo: string;
  nombre: string;
  categoria: Categoria;
  valorVenta: number;
  stockMinimo: number;
}

export interface ActualizarProductoInput {
  nombre: string;
  categoria: Categoria;
  valorVenta: number;
  stockMinimo: number;
  proveedor?: string;
}

export interface Comprador {
  celular: string;
  nombre: string;
  fechaPrimeraCompra: string | null;
}

export interface CompraInventario {
  id: number;
  codigoProducto: string;
  cantidad: number;
  valorCompraUnitario: string;
  proveedor: string | null;
  fechaCompra: string;
}

export interface ProductoNuevoInput {
  nombre: string;
  categoria: Categoria;
  valorVenta: number;
  stockMinimo?: number;
}

export interface RegistrarCompraInput {
  codigoProducto: string;
  cantidad: number;
  valorCompraUnitario: number;
  proveedor?: string;
  productoNuevo?: ProductoNuevoInput;
}

export interface ActualizarCompraInput {
  cantidad: number;
  valorCompraUnitario: number;
  proveedor?: string;
  fechaCompra: string;
}

export interface Cuota {
  id: number;
  idVenta: number;
  numeroCuota: number;
  valorCuota: string;
  fechaVencimiento: string;
  fechaPago: string | null;
  estado: EstadoCuota;
}

export interface CuotaConVenta extends Cuota {
  venta: Venta;
}

export type EstadoComision = 'pendiente' | 'liquidada';

export interface Venta {
  id: number;
  codigoProducto: string;
  compradorCelular: string | null;
  cantidad: number;
  valorContado: string;
  medioPago: MedioPago;
  numCuotas: number | null;
  frecuenciaCuotas: FrecuenciaCuotas | null;
  recargoCuotas: string | null;
  valorTotalVenta: string;
  costoPromedioAlMomento: string;
  ganancia: string;
  canal: Canal;
  fechaVenta: string;
  cuotas: Cuota[];
  vendedorId: number | null;
  vendedor: { id: number; nombre: string; apellido: string } | null;
  comisionPorcentaje: string;
  comision: string;
  comisionEstado: EstadoComision;
}

export interface Vendedor {
  id: number;
  nombre: string;
  apellido: string;
  porcentajeComision: string;
}

export interface ResumenComisionVendedor {
  vendedorId: number;
  vendedorNombre: string;
  cantidadVentas: number;
  totalComision: string;
}

export interface VentaPendienteComision extends Venta {
  producto: { nombre: string };
}

export interface Liquidacion {
  id: number;
  vendedorId: number;
  generadaPorId: number;
  fechaLiquidacion: string;
  totalComision: string;
  cantidadVentas: number;
  vendedor: { nombre: string; apellido: string };
  generadaPor: { nombre: string; apellido: string };
}

export interface CompradorNuevoInput {
  nombre: string;
}

export interface RegistrarVentaInput {
  codigoProducto: string;
  compradorCelular?: string;
  compradorNuevo?: CompradorNuevoInput;
  cantidad: number;
  valorContado?: number;
  medioPago: MedioPago;
  numCuotas?: number;
  frecuenciaCuotas?: FrecuenciaCuotas;
  canal: Canal;
  vendedorId?: number;
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

export interface ConfiguracionComisiones {
  recargoCuotasGlobal: string;
}
