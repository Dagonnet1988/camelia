import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);

  return next(req).pipe(
    catchError((err: unknown) => {
      const esRutaAuth = req.url.includes('/api/auth/');
      if (err instanceof HttpErrorResponse && err.status === 401 && !esRutaAuth) {
        router.navigate(['/login']);
      }
      return throwError(() => err);
    }),
  );
};
