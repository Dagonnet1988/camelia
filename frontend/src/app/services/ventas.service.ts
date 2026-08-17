import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import type { ActualizarVentaInput, RegistrarVentaInput, Venta } from '../models/domain.models';

const BASE = '/api/ventas';

@Injectable({ providedIn: 'root' })
export class VentasService {
  constructor(private http: HttpClient) {}

  listar(vendedorId?: number) {
    const url = vendedorId ? `${BASE}?vendedor_id=${vendedorId}` : BASE;
    return this.http.get<Venta[]>(url);
  }

  registrar(input: RegistrarVentaInput) {
    return this.http.post<Venta>(BASE, input);
  }

  actualizar(id: number, input: ActualizarVentaInput) {
    return this.http.put<Venta>(`${BASE}/${id}`, input);
  }

  eliminar(id: number) {
    return this.http.delete<void>(`${BASE}/${id}`);
  }
}
