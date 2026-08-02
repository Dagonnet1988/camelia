import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { catchError, map, of, tap } from 'rxjs';
import type { UsuarioSesion } from '../models/auth.models';

const BASE = '/api/auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  usuario = signal<UsuarioSesion | null>(null);

  constructor(private http: HttpClient) {}

  /** Siempre consulta al backend (fuente de verdad) y actualiza la señal local. */
  cargarSesion() {
    return this.http.get<UsuarioSesion>(`${BASE}/me`).pipe(
      tap((u) => this.usuario.set(u)),
      catchError(() => {
        this.usuario.set(null);
        return of(null);
      }),
    );
  }

  login(usuario: string, password: string) {
    return this.http
      .post<UsuarioSesion>(`${BASE}/login`, { usuario, password })
      .pipe(tap((u) => this.usuario.set(u)));
  }

  logout() {
    return this.http.post(`${BASE}/logout`, {}).pipe(tap(() => this.usuario.set(null)));
  }

  cambiarPassword(passwordActual: string, passwordNueva: string) {
    return this.http
      .post<UsuarioSesion>(`${BASE}/cambiar-password`, { passwordActual, passwordNueva })
      .pipe(tap((u) => this.usuario.set(u)));
  }

  esAdmin(): boolean {
    return this.usuario()?.rol === 'admin';
  }

  estaAutenticado() {
    return this.cargarSesion().pipe(map((u) => u !== null));
  }
}
