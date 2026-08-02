export type RolUsuario = 'admin' | 'user';

export interface UsuarioSesion {
  id: number;
  usuario: string;
  nombre: string;
  apellido: string;
  rol: RolUsuario;
  debeCambiarPassword: boolean;
}

export interface Usuario {
  id: number;
  usuario: string;
  nombre: string;
  apellido: string;
  rol: RolUsuario;
  debeCambiarPassword: boolean;
  fechaCreacion: string;
}

export interface CrearUsuarioInput {
  usuario: string;
  nombre: string;
  apellido: string;
  rol?: RolUsuario;
}
