import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import type {
  AbcItem,
  CarteraCuotasResponse,
  ContadoVsCuotasResponse,
  CostoProveedorGroup,
  GananciaAcumuladaItem,
  MargenProducto,
  RotacionInventarioResponse,
  StockMuertoItem,
  TicketPromedioResponse,
  TopProductosResponse,
} from '../models/metrics.models';

const BASE = '/api/metrics';

@Injectable({ providedIn: 'root' })
export class MetricsService {
  constructor(private http: HttpClient) {}

  topProductos(limit = 10) {
    return this.http.get<TopProductosResponse>(`${BASE}/top-productos`, {
      params: { limit },
    });
  }

  margenProductos() {
    return this.http.get<MargenProducto[]>(`${BASE}/margen-productos`);
  }

  rotacionInventario(dias = 30) {
    return this.http.get<RotacionInventarioResponse>(`${BASE}/rotacion-inventario`, {
      params: { dias },
    });
  }

  gananciaAcumulada(periodo: 'semana' | 'mes' = 'mes') {
    return this.http.get<GananciaAcumuladaItem[]>(`${BASE}/ganancia-acumulada`, {
      params: { periodo },
    });
  }

  abc() {
    return this.http.get<AbcItem[]>(`${BASE}/abc`);
  }

  ticketPromedio() {
    return this.http.get<TicketPromedioResponse>(`${BASE}/ticket-promedio`);
  }

  contadoVsCuotas() {
    return this.http.get<ContadoVsCuotasResponse>(`${BASE}/contado-vs-cuotas`);
  }

  carteraCuotas() {
    return this.http.get<CarteraCuotasResponse>(`${BASE}/cartera-cuotas`);
  }

  stockMuerto(dias = 30) {
    return this.http.get<StockMuertoItem[]>(`${BASE}/stock-muerto`, {
      params: { dias },
    });
  }

  costosProveedor() {
    return this.http.get<CostoProveedorGroup[]>(`${BASE}/costos-proveedor`);
  }
}
