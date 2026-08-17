import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { DifusionComponent } from '../difusion/difusion.component';
import type { EstadoWhatsapp, HistorialMensajeWhatsapp } from '../models/whatsapp.models';
import { WhatsappService } from '../services/whatsapp.service';
import { extractError } from '../shared/http-error';

const POLL_MS = 3000;

@Component({
  selector: 'app-whatsapp',
  imports: [FormsModule, DatePipe, DifusionComponent, RouterLink],
  templateUrl: './whatsapp.component.html',
  styleUrl: './whatsapp.component.scss',
})
export class WhatsappComponent implements OnInit, OnDestroy {
  estado = signal<EstadoWhatsapp>('desconectado');
  qr = signal<string | undefined>(undefined);
  numeroVinculado = signal<string | undefined>(undefined);

  numero = '';
  texto = '';
  enviando = signal(false);
  error = signal<string | null>(null);
  exito = signal<string | null>(null);

  historial = signal<HistorialMensajeWhatsapp[]>([]);

  private pollSub?: Subscription;

  constructor(private whatsapp: WhatsappService) {}

  ngOnInit(): void {
    this.pollSub = interval(POLL_MS)
      .pipe(switchMap(() => this.whatsapp.status()))
      .subscribe((r) => {
        this.estado.set(r.estado);
        this.qr.set(r.qr);
        this.numeroVinculado.set(r.numero);
      });
    this.whatsapp.status().subscribe((r) => {
      this.estado.set(r.estado);
      this.qr.set(r.qr);
      this.numeroVinculado.set(r.numero);
    });
    this.cargarHistorial();
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
  }

  cargarHistorial(): void {
    this.whatsapp.historial().subscribe((h) => this.historial.set(h));
  }

  reconectar(): void {
    this.whatsapp.reconectar().subscribe((r) => {
      this.estado.set(r.estado);
      this.qr.set(r.qr);
      this.numeroVinculado.set(r.numero);
    });
  }

  cerrarSesion(): void {
    if (!confirm('¿Cerrar la sesion de WhatsApp? Vas a tener que escanear el QR de nuevo.')) return;
    this.whatsapp.logout().subscribe((r) => {
      this.estado.set(r.estado);
      this.qr.set(r.qr);
      this.numeroVinculado.set(r.numero);
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
        this.cargarHistorial();
      },
      error: (err) => {
        this.error.set(extractError(err));
        this.enviando.set(false);
        this.cargarHistorial();
      },
    });
  }
}
