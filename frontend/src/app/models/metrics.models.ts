export interface TopProductoItem {
  codigo: string;
  nombre: string;
  unidadesVendidas: number;
  ingresos: string;
}

export interface TopProductosResponse {
  porUnidades: TopProductoItem[];
  porIngresos: TopProductoItem[];
}

export interface MargenProducto {
  codigo: string;
  nombre: string;
  categoria: string;
  valorVenta: string;
  costoCompra: string;
  margen: string;
}

export interface RotacionProducto {
  codigo: string;
  nombre: string;
  categoria: string;
  unidadesVendidas: number;
  rotacionDiaria: string;
}

export interface RotacionCategoria {
  categoria: string;
  unidadesVendidas: number;
  rotacionDiaria: string;
}

export interface RotacionInventarioResponse {
  dias: number;
  porProducto: RotacionProducto[];
  porCategoria: RotacionCategoria[];
}

export interface GananciaAcumuladaItem {
  periodo: string;
  ganancia: string;
  gananciaAcumulada: string;
}

export interface AbcItem {
  codigo: string;
  nombre: string;
  ganancia: string;
  porcentajeAcumulado: string;
  clase: 'A' | 'B' | 'C';
}

export interface TicketPromedioResponse {
  general: { ticketPromedio: string; numeroVentas: number };
  porComprador: {
    compradorCelular: string;
    nombre: string;
    numeroVentas: number;
    ticketPromedio: string;
  }[];
}

export interface ContadoVsCuotasResponse {
  porMedioPago: {
    medioPago: 'contado' | 'cuotas';
    numeroVentas: number;
    margenPromedio: string;
    recargoPromedio: string;
  }[];
  tasaMora: number;
  sugerencia: string;
}

export interface ProximoVencimiento {
  id: number;
  numeroCuota: number;
  valorCuota: string;
  fechaVencimiento: string;
  estado: 'pendiente' | 'pagada' | 'atrasada';
  venta: {
    items: { producto: { nombre: string } }[];
    comprador: { celular: string; nombre: string } | null;
  };
}

export interface CarteraCuotasResponse {
  resumen: { estado: 'pendiente' | 'atrasada'; cantidad: number; total: string }[];
  proximosVencimientos: ProximoVencimiento[];
}

export interface StockMuertoItem {
  codigo: string;
  nombre: string;
  stockActual: number;
  ultimaVenta: string | null;
}

export interface CostoProveedorCompra {
  codigoProducto: string;
  valorCompraUnitario: string;
  fechaCompra: string;
}

export interface CostoProveedorGroup {
  proveedor: string;
  historico: CostoProveedorCompra[];
}
