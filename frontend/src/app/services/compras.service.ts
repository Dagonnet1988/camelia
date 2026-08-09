import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import type { ActualizarCompraInput, CompraInventario, RegistrarCompraInput } from '../models/domain.models';

const BASE = '/api/compras';

@Injectable({ providedIn: 'root' })
export class ComprasService {
  constructor(private http: HttpClient) {}

  listar(codigoProducto?: string) {
    return this.http.get<CompraInventario[]>(BASE, {
      params: codigoProducto ? { codigo_producto: codigoProducto } : {},
    });
  }

  registrar(input: RegistrarCompraInput) {
    return this.http.post<CompraInventario>(BASE, input);
  }

  actualizar(id: number, input: ActualizarCompraInput) {
    return this.http.put<CompraInventario>(`${BASE}/${id}`, input);
  }
}
