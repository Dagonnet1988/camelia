export type RolUsuario = 'admin' | 'manager' | 'user';

export interface UsuarioSesion {
  id: number;
  usuario: string;
  nombre: string;
  apellido: string;
  rol: RolUsuario;
  debeCambiarPassword: boolean;
  porcentajeComision: string;
}

export interface Usuario {
  id: number;
  usuario: string;
  nombre: string;
  apellido: string;
  rol: RolUsuario;
  debeCambiarPassword: boolean;
  porcentajeComision: string;
  fechaCreacion: string;
}

export interface CrearUsuarioInput {
  usuario: string;
  nombre: string;
  apellido: string;
  rol?: RolUsuario;
}
