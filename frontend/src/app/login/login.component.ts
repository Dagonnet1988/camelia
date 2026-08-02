import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import type { UsuarioSesion } from '../models/auth.models';
import { AuthService } from '../services/auth.service';
import { LoginFormComponent } from './login-form.component';

@Component({
  selector: 'app-login',
  imports: [LoginFormComponent],
  templateUrl: './login.component.html',
})
export class LoginComponent implements OnInit {
  constructor(
    private auth: AuthService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    // si ya hay sesion activa, no tiene sentido mostrar el login
    this.auth.cargarSesion().subscribe((u) => {
      if (!u) return;
      this.irSegunSesion(u);
    });
  }

  onIngresado(u: UsuarioSesion): void {
    this.irSegunSesion(u);
  }

  private irSegunSesion(u: UsuarioSesion): void {
    if (u.debeCambiarPassword) {
      this.router.navigateByUrl('/cambiar-password');
    } else if (u.rol === 'admin' || u.rol === 'manager') {
      this.router.navigateByUrl('/dashboard');
    } else {
      this.router.navigateByUrl('/productos');
    }
  }
}
