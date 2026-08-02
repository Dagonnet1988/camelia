import { Component, OnInit, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  menuAbierto = signal(false);

  constructor(
    protected auth: AuthService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.auth.cargarSesion().subscribe();
  }

  cerrarSesion(): void {
    this.auth.logout().subscribe(() => this.router.navigateByUrl('/login'));
  }
}
