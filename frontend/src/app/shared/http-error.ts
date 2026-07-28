import { HttpErrorResponse } from '@angular/common/http';

export function extractError(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    return err.error?.error ?? err.message;
  }
  return 'Error inesperado';
}
