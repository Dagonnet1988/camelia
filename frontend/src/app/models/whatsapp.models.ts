export type EstadoWhatsapp = 'desconectado' | 'conectando' | 'esperando_qr' | 'conectado';

export interface EstadoWhatsappResponse {
  estado: EstadoWhatsapp;
  qr?: string;
}
