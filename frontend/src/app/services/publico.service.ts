import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import type { ProductoPublico } from '../models/domain.models';

const BASE = '/api/publico';

@Injectable({ providedIn: 'root' })
export class PublicoService {
  constructor(private http: HttpClient) {}

  catalogo() {
    return this.http.get<ProductoPublico[]>(`${BASE}/catalogo`);
  }

  whatsappNumero() {
    return this.http.get<{ numero: string | null }>(`${BASE}/whatsapp-numero`);
  }
}
