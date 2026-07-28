import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import type { CuotaConVenta, EstadoCuota } from '../models/domain.models';

const BASE = '/api/cuotas';

@Injectable({ providedIn: 'root' })
export class CuotasService {
  constructor(private http: HttpClient) {}

  listar(estado?: EstadoCuota) {
    return this.http.get<CuotaConVenta[]>(BASE, {
      params: estado ? { estado } : {},
    });
  }

  pagar(id: number) {
    return this.http.patch<CuotaConVenta>(`${BASE}/${id}/pagar`, {});
  }
}
