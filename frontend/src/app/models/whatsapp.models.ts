export type EstadoWhatsapp = 'desconectado' | 'conectando' | 'esperando_qr' | 'conectado';

export interface EstadoWhatsappResponse {
  estado: EstadoWhatsapp;
  qr?: string;
}

export interface ConfiguracionWhatsapp {
  recordatoriosCuotasActivos: boolean;
  limiteMensajesHora: number | null;
  limiteMensajesDia: number | null;
}

export type EstadoMensajeWhatsapp = 'enviado' | 'fallido';

export interface HistorialMensajeWhatsapp {
  id: number;
  numero: string;
  mensaje: string;
  tipo: string;
  estado: EstadoMensajeWhatsapp;
  error: string | null;
  fechaEnvio: string;
}
