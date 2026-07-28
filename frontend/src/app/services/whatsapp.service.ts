import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import type { EstadoWhatsappResponse } from '../models/whatsapp.models';

const BASE = '/api/whatsapp';

@Injectable({ providedIn: 'root' })
export class WhatsappService {
  constructor(private http: HttpClient) {}

  status() {
    return this.http.get<EstadoWhatsappResponse>(`${BASE}/status`);
  }

  reconectar() {
    return this.http.post<EstadoWhatsappResponse>(`${BASE}/reconectar`, {});
  }

  logout() {
    return this.http.post<EstadoWhatsappResponse>(`${BASE}/logout`, {});
  }

  enviar(numero: string, texto: string) {
    return this.http.post<{ enviado: boolean }>(`${BASE}/enviar`, { numero, texto });
  }

  enviarRecordatoriosAhora() {
    return this.http.post<{ ejecutado: boolean }>(`${BASE}/recordatorios/enviar-ahora`, {});
  }
}
