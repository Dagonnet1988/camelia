import { Component, EventEmitter, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { UsuarioSesion } from '../models/auth.models';
import { AuthService } from '../services/auth.service';
import { extractError } from '../shared/http-error';

@Component({
  selector: 'app-login-form',
  imports: [FormsModule],
  templateUrl: './login-form.component.html',
})
export class LoginFormComponent {
  @Output() ingresado = new EventEmitter<UsuarioSesion>();

  usuario = '';
  password = '';
  enviando = signal(false);
  error = signal<string | null>(null);

  constructor(private auth: AuthService) {}

  ingresar(): void {
    this.error.set(null);
    if (!this.usuario || !this.password) {
      this.error.set('Usuario y contraseña son obligatorios');
      return;
    }
    this.enviando.set(true);
    this.auth.login(this.usuario, this.password).subscribe({
      next: (u) => {
        this.enviando.set(false);
        this.ingresado.emit(u);
      },
      error: (err) => {
        this.error.set(extractError(err));
        this.enviando.set(false);
      },
    });
  }
}
