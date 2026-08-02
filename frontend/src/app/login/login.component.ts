import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { extractError } from '../shared/http-error';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.component.html',
})
export class LoginComponent implements OnInit {
  usuario = '';
  password = '';
  enviando = signal(false);
  error = signal<string | null>(null);

  constructor(
    private auth: AuthService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    // si ya hay sesion activa, no tiene sentido mostrar el login
    this.auth.cargarSesion().subscribe((u) => {
      if (!u) return;
      this.router.navigateByUrl(u.debeCambiarPassword ? '/cambiar-password' : '/');
    });
  }

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
        this.router.navigateByUrl(u.debeCambiarPassword ? '/cambiar-password' : '/');
      },
      error: (err) => {
        this.error.set(extractError(err));
        this.enviando.set(false);
      },
    });
  }
}
