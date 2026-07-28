export type EstadoWhatsapp = 'desconectado' | 'conectando' | 'esperando_qr' | 'conectado';

export interface EstadoWhatsappResponse {
  estado: EstadoWhatsapp;
  qr?: string;
}

export interface ConfiguracionWhatsapp {
  recordatoriosCuotasActivos: boolean;
  limiteMensajesHora: number | null;
  limiteMensajesDia: number | null;
  envioMasivoDelayMinSeg: number;
  envioMasivoDelayMaxSeg: number;
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

export type EstadoEnvioMasivo = 'pendiente' | 'en_progreso' | 'completado' | 'cancelado';
export type EstadoEnvioDestinatario = 'pendiente' | 'enviado' | 'fallido';

export interface EnvioMasivoDestinatario {
  id: number;
  envioMasivoId: number;
  compradorCelular: string;
  nombre: string;
  estado: EstadoEnvioDestinatario;
  error: string | null;
  fechaEnvio: string | null;
}

export interface EnvioMasivo {
  id: number;
  mensaje: string;
  estado: EstadoEnvioMasivo;
  totalDestinatarios: number;
  enviados: number;
  fallidos: number;
  fechaCreacion: string;
  fechaFin: string | null;
}

export interface EnvioMasivoConDetalle extends EnvioMasivo {
  destinatarios: EnvioMasivoDestinatario[];
}

export interface CrearEnvioMasivoInput {
  mensaje: string;
  destinatarios: { celular: string; nombre: string }[];
}
