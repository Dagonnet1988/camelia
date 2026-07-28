import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import type { Comprador } from '../models/domain.models';

const BASE = '/api/compradores';

@Injectable({ providedIn: 'root' })
export class CompradoresService {
  constructor(private http: HttpClient) {}

  listar() {
    return this.http.get<Comprador[]>(BASE);
  }

  crear(input: { celular: string; nombre: string }) {
    return this.http.post<Comprador>(BASE, input);
  }

  actualizar(celular: string, nombre: string) {
    return this.http.put<Comprador>(`${BASE}/${celular}`, { nombre });
  }
}
