export type Categoria = 'arete' | 'anillo' | 'manilla' | 'collar' | 'otro';
export type MedioPago = 'contado' | 'cuotas';
export type Canal = 'whatsapp' | 'presencial';
export type EstadoCuota = 'pendiente' | 'pagada' | 'atrasada';

export interface Producto {
  codigo: string;
  nombre: string;
  categoria: Categoria;
  valorVenta: string;
  costoPromedio: string;
  stockActual: number;
  stockMinimo: number;
  fechaIngreso: string;
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

export interface Venta {
  id: number;
  codigoProducto: string;
  compradorCelular: string | null;
  cantidad: number;
  valorContado: string;
  medioPago: MedioPago;
  numCuotas: number | null;
  recargoCuotas: string | null;
  valorTotalVenta: string;
  costoPromedioAlMomento: string;
  ganancia: string;
  canal: Canal;
  fechaVenta: string;
  cuotas: Cuota[];
}

export interface RegistrarVentaInput {
  codigoProducto: string;
  compradorCelular?: string;
  cantidad: number;
  valorContado?: number;
  medioPago: MedioPago;
  numCuotas?: number;
  recargoCuotas?: number;
  canal: Canal;
}
