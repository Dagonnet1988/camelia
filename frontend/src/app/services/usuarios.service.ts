import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import type { CrearUsuarioInput, Usuario } from '../models/auth.models';

const BASE = '/api/usuarios';

@Injectable({ providedIn: 'root' })
export class UsuariosService {
  constructor(private http: HttpClient) {}

  listar() {
    return this.http.get<Usuario[]>(BASE);
  }

  crear(input: CrearUsuarioInput) {
    return this.http.post<Usuario>(BASE, input);
  }
}
