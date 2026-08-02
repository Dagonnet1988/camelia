import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { extractError } from '../shared/http-error';

@Component({
  selector: 'app-cambiar-password',
  imports: [FormsModule],
  templateUrl: './cambiar-password.component.html',
})
export class CambiarPasswordComponent {
  passwordActual = '';
  passwordNueva = '';
  passwordConfirmar = '';
  enviando = signal(false);
  error = signal<string | null>(null);

  constructor(
    private auth: AuthService,
    private router: Router,
  ) {}

  get esPrimerCambio(): boolean {
    return this.auth.usuario()?.debeCambiarPassword ?? false;
  }

  guardar(): void {
    this.error.set(null);

    if ((!this.esPrimerCambio && !this.passwordActual) || !this.passwordNueva) {
      this.error.set('Todos los campos son obligatorios');
      return;
    }
    if (this.passwordNueva.length < 6) {
      this.error.set('La nueva contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (this.passwordNueva !== this.passwordConfirmar) {
      this.error.set('La confirmación no coincide con la nueva contraseña');
      return;
    }

    this.enviando.set(true);
    this.auth.cambiarPassword(this.esPrimerCambio ? undefined : this.passwordActual, this.passwordNueva).subscribe({
      next: (u) => {
        this.enviando.set(false);
        this.router.navigateByUrl(u.rol === 'admin' || u.rol === 'manager' ? '/dashboard' : '/productos');
      },
      error: (err) => {
        this.error.set(extractError(err));
        this.enviando.set(false);
      },
    });
  }
}
