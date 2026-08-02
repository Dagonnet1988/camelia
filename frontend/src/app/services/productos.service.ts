import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import type { ActualizarProductoInput, CrearProductoInput, FotoProducto, Producto } from '../models/domain.models';

const BASE = '/api/productos';

@Injectable({ providedIn: 'root' })
export class ProductosService {
  constructor(private http: HttpClient) {}

  listar() {
    return this.http.get<Producto[]>(BASE);
  }

  crear(input: CrearProductoInput) {
    return this.http.post<Producto>(BASE, input);
  }

  actualizar(codigo: string, input: ActualizarProductoInput) {
    return this.http.put<Producto>(`${BASE}/${codigo}`, input);
  }

  eliminar(codigo: string) {
    return this.http.delete<void>(`${BASE}/${codigo}`);
  }

  subirFotos(codigo: string, archivos: File[]) {
    const form = new FormData();
    archivos.forEach((archivo) => form.append('fotos', archivo));
    return this.http.post<FotoProducto[]>(`${BASE}/${codigo}/fotos`, form);
  }

  eliminarFoto(codigo: string, fotoId: number) {
    return this.http.delete<void>(`${BASE}/${codigo}/fotos/${fotoId}`);
  }
}
