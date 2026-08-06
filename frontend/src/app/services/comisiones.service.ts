import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import type {
  ConfiguracionComisiones,
  Liquidacion,
  ResumenComisionVendedor,
  Vendedor,
  VentaPendienteComision,
} from '../models/domain.models';

const BASE = '/api/comisiones';

@Injectable({ providedIn: 'root' })
export class ComisionesService {
  constructor(private http: HttpClient) {}

  vendedores() {
    return this.http.get<Vendedor[]>(`${BASE}/vendedores`);
  }

  configuracion() {
    return this.http.get<ConfiguracionComisiones>(`${BASE}/configuracion`);
  }

  actualizarConfiguracion(recargoCuotasGlobal: number) {
    return this.http.put<ConfiguracionComisiones>(`${BASE}/configuracion`, { recargoCuotasGlobal });
  }

  resumen() {
    return this.http.get<ResumenComisionVendedor[]>(`${BASE}/resumen`);
  }

  pendientesDeVendedor(vendedorId: number) {
    return this.http.get<VentaPendienteComision[]>(`${BASE}/vendedores/${vendedorId}/pendientes`);
  }

  liquidar(vendedorId: number) {
    return this.http.post<Liquidacion>(`${BASE}/vendedores/${vendedorId}/liquidar`, {});
  }

  liquidaciones(vendedorId?: number) {
    const url = vendedorId ? `${BASE}/liquidaciones?vendedorId=${vendedorId}` : `${BASE}/liquidaciones`;
    return this.http.get<Liquidacion[]>(url);
  }

  urlPdf(id: number): string {
    return `${BASE}/liquidaciones/${id}/pdf`;
  }
}
