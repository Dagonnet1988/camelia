import { Component, OnInit, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LoginFormComponent } from './login/login-form.component';
import type { UsuarioSesion } from './models/auth.models';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LoginFormComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  menuAbierto = signal(false);
  mostrarLogin = signal(false);

  constructor(
    protected auth: AuthService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.auth.cargarSesion().subscribe();
  }

  onIngresado(u: UsuarioSesion): void {
    this.mostrarLogin.set(false);
    if (u.debeCambiarPassword) {
      this.router.navigateByUrl('/cambiar-password');
    } else if (u.rol === 'admin' || u.rol === 'manager') {
      this.router.navigateByUrl('/dashboard');
    } else {
      this.router.navigateByUrl('/productos');
    }
  }

  cerrarSesion(): void {
    this.auth.logout().subscribe(() => this.router.navigateByUrl('/'));
  }
}
