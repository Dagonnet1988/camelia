import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import type {
  ConfiguracionWhatsapp,
  CrearEnvioMasivoInput,
  EnvioMasivo,
  EnvioMasivoConDetalle,
  EstadoMensajeWhatsapp,
  EstadoWhatsappResponse,
  HistorialMensajeWhatsapp,
} from '../models/whatsapp.models';

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

  obtenerConfig() {
    return this.http.get<ConfiguracionWhatsapp>(`${BASE}/config`);
  }

  actualizarConfig(cambios: Partial<ConfiguracionWhatsapp>) {
    return this.http.put<ConfiguracionWhatsapp>(`${BASE}/config`, cambios);
  }

  historial(estado?: EstadoMensajeWhatsapp) {
    return this.http.get<HistorialMensajeWhatsapp[]>(`${BASE}/historial`, {
      params: estado ? { estado } : {},
    });
  }

  crearEnvioMasivo(input: CrearEnvioMasivoInput) {
    return this.http.post<EnvioMasivoConDetalle>(`${BASE}/envios-masivos`, input);
  }

  listarEnviosMasivos() {
    return this.http.get<EnvioMasivo[]>(`${BASE}/envios-masivos`);
  }

  obtenerEnvioMasivo(id: number) {
    return this.http.get<EnvioMasivoConDetalle>(`${BASE}/envios-masivos/${id}`);
  }

  cancelarEnvioMasivo(id: number) {
    return this.http.post<EnvioMasivo>(`${BASE}/envios-masivos/${id}/cancelar`, {});
  }
}
