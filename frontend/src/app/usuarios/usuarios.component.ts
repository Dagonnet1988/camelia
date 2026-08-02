import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { RolUsuario, Usuario } from '../models/auth.models';
import { UsuariosService } from '../services/usuarios.service';
import { extractError } from '../shared/http-error';

@Component({
  selector: 'app-usuarios',
  imports: [FormsModule, DatePipe],
  templateUrl: './usuarios.component.html',
  styleUrl: './usuarios.component.scss',
})
export class UsuariosComponent implements OnInit {
  usuarios = signal<Usuario[]>([]);
  error = signal<string | null>(null);
  exito = signal<string | null>(null);
  guardando = signal(false);

  nuevoUsuario = '';
  nombre = '';
  apellido = '';
  rol: RolUsuario = 'user';

  constructor(private usuariosService: UsuariosService) {}

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.usuariosService.listar().subscribe((data) => this.usuarios.set(data));
  }

  crear(): void {
    this.error.set(null);
    this.exito.set(null);

    if (!this.nuevoUsuario || !this.nombre || !this.apellido) {
      this.error.set('Usuario, nombre y apellido son obligatorios');
      return;
    }

    this.guardando.set(true);
    this.usuariosService
      .crear({ usuario: this.nuevoUsuario, nombre: this.nombre, apellido: this.apellido, rol: this.rol })
      .subscribe({
        next: (u) => {
          this.exito.set(`Usuario ${u.usuario} creado — contraseña inicial: ${u.usuario} (se pedirá cambiarla al ingresar)`);
          this.guardando.set(false);
          this.nuevoUsuario = '';
          this.nombre = '';
          this.apellido = '';
          this.rol = 'user';
          this.cargar();
        },
        error: (err) => {
          this.error.set(extractError(err));
          this.guardando.set(false);
        },
      });
  }

  resetearPassword(u: Usuario): void {
    if (!confirm(`¿Resetear la clave de ${u.usuario}? Va a quedar igual al usuario (${u.usuario}) y se le pedira cambiarla al ingresar.`)) {
      return;
    }
    this.error.set(null);
    this.exito.set(null);
    this.usuariosService.resetearPassword(u.id).subscribe({
      next: () => {
        this.exito.set(`Clave de ${u.usuario} reseteada — nueva clave inicial: ${u.usuario}`);
        this.cargar();
      },
      error: (err) => this.error.set(extractError(err)),
    });
  }
}
