import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';

/** Dashboard y Compras: solo admin/manager. Un 'user' restringido cae a /productos. */
export const managerGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.cargarSesion().pipe(
    map((usuario) => {
      if (!usuario) return router.parseUrl('/login');
      if (usuario.debeCambiarPassword) return router.parseUrl('/cambiar-password');
      if (usuario.rol === 'user') return router.parseUrl('/productos');
      return true;
    }),
  );
};
