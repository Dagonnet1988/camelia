import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, interval } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import type { Comprador } from '../models/domain.models';
import type { EnvioMasivo, EnvioMasivoConDetalle } from '../models/whatsapp.models';
import { CompradoresService } from '../services/compradores.service';
import { WhatsappService } from '../services/whatsapp.service';
import { extractError } from '../shared/http-error';

const POLL_MS = 4000;

@Component({
  selector: 'app-difusion',
  imports: [FormsModule, DatePipe],
  templateUrl: './difusion.component.html',
  styleUrl: './difusion.component.scss',
})
export class DifusionComponent implements OnInit, OnDestroy {
  compradores = signal<Comprador[]>([]);
  seleccionados = new Set<string>();

  mensaje = '';
  enviando = signal(false);
  error = signal<string | null>(null);
  exito = signal<string | null>(null);

  delayMinSeg: number = 5;
  delayMaxSeg: number = 15;
  guardandoDelay = signal(false);
  delayGuardado = signal(false);

  envios = signal<EnvioMasivo[]>([]);
  detalleAbierto = signal<EnvioMasivoConDetalle | null>(null);

  private pollSub?: Subscription;

  constructor(
    private compradoresService: CompradoresService,
    private whatsapp: WhatsappService,
  ) {}

  ngOnInit(): void {
    this.compradoresService.listar().subscribe((data) => this.compradores.set(data));
    this.whatsapp.obtenerConfig().subscribe((c) => {
      this.delayMinSeg = c.envioMasivoDelayMinSeg;
      this.delayMaxSeg = c.envioMasivoDelayMaxSeg;
    });
    this.cargarEnvios();

    this.pollSub = interval(POLL_MS)
      .pipe(switchMap(() => this.whatsapp.listarEnviosMasivos()))
      .subscribe((data) => {
        this.envios.set(data);
        const abierto = this.detalleAbierto();
        if (abierto && (abierto.estado === 'pendiente' || abierto.estado === 'en_progreso')) {
          this.verDetalle(abierto.id);
        }
      });
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
  }

  cargarEnvios(): void {
    this.whatsapp.listarEnviosMasivos().subscribe((data) => this.envios.set(data));
  }

  toggleSeleccion(celular: string): void {
    if (this.seleccionados.has(celular)) {
      this.seleccionados.delete(celular);
    } else {
      this.seleccionados.add(celular);
    }
  }

  estaSeleccionado(celular: string): boolean {
    return this.seleccionados.has(celular);
  }

  seleccionarTodos(): void {
    for (const c of this.compradores()) {
      this.seleccionados.add(c.celular);
    }
  }

  deseleccionarTodos(): void {
    this.seleccionados.clear();
  }

  crearEnvio(): void {
    this.error.set(null);
    this.exito.set(null);

    if (!this.mensaje.trim()) {
      this.error.set('El mensaje es obligatorio');
      return;
    }
    if (this.seleccionados.size === 0) {
      this.error.set('Selecciona al menos un comprador');
      return;
    }

    const destinatarios = this.compradores()
      .filter((c) => this.seleccionados.has(c.celular))
      .map((c) => ({ celular: c.celular, nombre: c.nombre }));

    this.enviando.set(true);
    this.whatsapp.crearEnvioMasivo({ mensaje: this.mensaje, destinatarios }).subscribe({
      next: (envio) => {
        this.exito.set(`Envio masivo #${envio.id} creado con ${envio.totalDestinatarios} destinatarios`);
        this.enviando.set(false);
        this.mensaje = '';
        this.seleccionados.clear();
        this.cargarEnvios();
      },
      error: (err) => {
        this.error.set(extractError(err));
        this.enviando.set(false);
      },
    });
  }

  guardarDelay(): void {
    this.guardandoDelay.set(true);
    this.delayGuardado.set(false);
    this.whatsapp
      .actualizarConfig({ envioMasivoDelayMinSeg: this.delayMinSeg, envioMasivoDelayMaxSeg: this.delayMaxSeg })
      .subscribe({
        next: (c) => {
          this.delayMinSeg = c.envioMasivoDelayMinSeg;
          this.delayMaxSeg = c.envioMasivoDelayMaxSeg;
          this.guardandoDelay.set(false);
          this.delayGuardado.set(true);
        },
        error: (err) => {
          this.error.set(extractError(err));
          this.guardandoDelay.set(false);
        },
      });
  }

  verDetalle(id: number): void {
    this.whatsapp.obtenerEnvioMasivo(id).subscribe((d) => this.detalleAbierto.set(d));
  }

  cerrarDetalle(): void {
    this.detalleAbierto.set(null);
  }

  cancelar(id: number): void {
    if (!confirm('¿Cancelar este envio masivo? Los destinatarios pendientes no recibiran el mensaje.')) return;
    this.whatsapp.cancelarEnvioMasivo(id).subscribe({
      next: () => {
        this.cargarEnvios();
        if (this.detalleAbierto()?.id === id) this.verDetalle(id);
      },
      error: (err) => this.error.set(extractError(err)),
    });
  }
}
