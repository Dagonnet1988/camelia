import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, interval } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import type { EstadoWhatsapp } from '../models/whatsapp.models';
import { WhatsappService } from '../services/whatsapp.service';
import { extractError } from '../shared/http-error';

const POLL_MS = 3000;

@Component({
  selector: 'app-whatsapp',
  imports: [FormsModule],
  templateUrl: './whatsapp.component.html',
  styleUrl: './whatsapp.component.scss',
})
export class WhatsappComponent implements OnInit, OnDestroy {
  estado = signal<EstadoWhatsapp>('desconectado');
  qr = signal<string | undefined>(undefined);

  numero = '';
  texto = '';
  enviando = signal(false);
  error = signal<string | null>(null);
  exito = signal<string | null>(null);

  private pollSub?: Subscription;

  constructor(private whatsapp: WhatsappService) {}

  ngOnInit(): void {
    this.pollSub = interval(POLL_MS)
      .pipe(switchMap(() => this.whatsapp.status()))
      .subscribe((r) => {
        this.estado.set(r.estado);
        this.qr.set(r.qr);
      });
    this.whatsapp.status().subscribe((r) => {
      this.estado.set(r.estado);
      this.qr.set(r.qr);
    });
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
  }

  reconectar(): void {
    this.whatsapp.reconectar().subscribe((r) => {
      this.estado.set(r.estado);
      this.qr.set(r.qr);
    });
  }

  cerrarSesion(): void {
    if (!confirm('¿Cerrar la sesion de WhatsApp? Vas a tener que escanear el QR de nuevo.')) return;
    this.whatsapp.logout().subscribe((r) => {
      this.estado.set(r.estado);
      this.qr.set(r.qr);
    });
  }

  enviarMensaje(): void {
    this.error.set(null);
    this.exito.set(null);
    if (!this.numero || !this.texto) {
      this.error.set('Numero y texto son obligatorios');
      return;
    }
    this.enviando.set(true);
    this.whatsapp.enviar(this.numero, this.texto).subscribe({
      next: () => {
        this.exito.set('Mensaje enviado');
        this.enviando.set(false);
        this.texto = '';
      },
      error: (err) => {
        this.error.set(extractError(err));
        this.enviando.set(false);
      },
    });
  }

  enviarRecordatoriosAhora(): void {
    this.error.set(null);
    this.exito.set(null);
    this.whatsapp.enviarRecordatoriosAhora().subscribe({
      next: () => this.exito.set('Recordatorios de cuotas procesados'),
      error: (err) => this.error.set(extractError(err)),
    });
  }
}
