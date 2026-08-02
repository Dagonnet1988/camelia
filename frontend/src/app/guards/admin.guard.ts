import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.cargarSesion().pipe(
    map((usuario) => {
      if (!usuario) return router.parseUrl('/login');
      if (usuario.rol !== 'admin') return router.parseUrl('/');
      return true;
    }),
  );
};
