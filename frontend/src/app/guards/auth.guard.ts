import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.cargarSesion().pipe(
    map((usuario) => {
      if (!usuario) return router.parseUrl('/login');
      if (usuario.debeCambiarPassword && state.url !== '/cambiar-password') {
        return router.parseUrl('/cambiar-password');
      }
      return true;
    }),
  );
};

export const soloAutenticadoGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.cargarSesion().pipe(map((usuario) => (usuario ? true : router.parseUrl('/login'))));
};
