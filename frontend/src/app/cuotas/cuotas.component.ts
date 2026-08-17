import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Comprador, CuotaConVenta, EstadoCuota } from '../models/domain.models';
import type { CarteraCuotasResponse } from '../models/metrics.models';
import type { EstadoWhatsapp } from '../models/whatsapp.models';
import { AuthService } from '../services/auth.service';
import { ComisionesService } from '../services/comisiones.service';
import { CompradoresService } from '../services/compradores.service';
import { CuotasService } from '../services/cuotas.service';
import { MetricsService } from '../services/metrics.service';
import { WhatsappService } from '../services/whatsapp.service';
import { extractError } from '../shared/http-error';
import { StatTileComponent } from '../shared/stat-tile/stat-tile.component';
import { resumenProductosVenta } from '../shared/venta-resumen';

const MONEDA = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

type FiltroEstado = 'todas' | EstadoCuota;

@Component({
  selector: 'app-cuotas',
  imports: [FormsModule, StatTileComponent],
  templateUrl: './cuotas.component.html',
  styleUrl: './cuotas.component.scss',
})
export class CuotasComponent implements OnInit {
  resumenProductosVenta = resumenProductosVenta;

  cuotas = signal<CuotaConVenta[]>([]);
  compradores = signal<Comprador[]>([]);
  filtroEstado = signal<FiltroEstado>('todas');
  ventaExpandidaId = signal<number | null>(null);

  error = signal<string | null>(null);
  exito = signal<string | null>(null);

  pagandoCuotaId = signal<number | null>(null);
  editandoFechaCuotaId = signal<number | null>(null);
  guardandoFechaCuotaId = signal<number | null>(null);
  nuevaFechaCuota = '';

  // Cartera (manager/admin)
  cartera = signal<CarteraCuotasResponse | undefined>(undefined);

  // Recordatorios automaticos (manager/admin) - movido de WhatsApp
  estadoWhatsapp = signal<EstadoWhatsapp>('desconectado');
  recordatoriosActivos = signal(true);
  guardandoConfig = signal(false);
  limiteMensajesHora: number | null = 20;
  limiteMensajesDia: number | null = 100;
  guardandoLimites = signal(false);
  limitesGuardados = signal(false);
  enviandoRecordatorios = signal(false);

  // Recargo por cuotas por defecto (manager/admin) - movido de Comisiones
  recargoCuotasGlobal: number | null = null;
  guardandoRecargo = signal(false);

  // Solo se usa cuando filtroEstado() !== 'todas' - lista plana de cuotas individuales
  // filtradas por estado (cruza ventas, es la vista correcta para "que cuotas estan en tal
  // estado"). Con "todas" seleccionado se usa la vista agrupada por venta (ventasConSaldo).
  cuotasFiltradas = computed(() => {
    const estado = this.filtroEstado();
    return this.cuotas().filter((c) => estado === 'todas' || c.estado === estado);
  });

  // Vista agrupada por venta para el filtro "todas": una fila por venta con saldo pendiente
  // (oculta las que ya pagaron todas sus cuotas - esas se siguen viendo filtrando por
  // "Pagada"). GET /api/cuotas sin filtro trae todas las cuotas, asi que agrupar el array
  // plano ya cargado por idVenta reconstruye el set completo de cuotas de cada venta sin
  // pedirle nada nuevo al backend.
  ventasConSaldo = computed(() => {
    const grupos = new Map<number, CuotaConVenta[]>();
    for (const c of this.cuotas()) {
      const grupo = grupos.get(c.idVenta);
      if (grupo) grupo.push(c);
      else grupos.set(c.idVenta, [c]);
    }

    const resultado = Array.from(grupos.values()).map((cuotasDeVenta) => {
      const pendientes = cuotasDeVenta.filter((c) => c.estado !== 'pagada');
      const saldoPendiente = pendientes.reduce((acc, c) => acc + Number(c.valorCuota), 0);
      const proximoVencimiento = pendientes
        .map((c) => c.fechaVencimiento)
        .sort()
        .at(0);
      return {
        venta: cuotasDeVenta[0]!.venta,
        cuotasDeVenta: [...cuotasDeVenta].sort((a, b) => a.numeroCuota - b.numeroCuota),
        saldoPendiente,
        proximoVencimiento,
        tieneAtrasada: pendientes.some((c) => c.estado === 'atrasada'),
      };
    });

    return resultado.filter((v) => v.saldoPendiente > 0).sort((a, b) => (a.proximoVencimiento ?? '').localeCompare(b.proximoVencimiento ?? ''));
  });

  constructor(
    private cuotasService: CuotasService,
    private compradoresService: CompradoresService,
    private metrics: MetricsService,
    private whatsapp: WhatsappService,
    private comisionesService: ComisionesService,
    protected auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.cargarCuotas();
    this.compradoresService.listar().subscribe((data) => this.compradores.set(data));
    if (this.auth.esManagerOAdmin()) {
      this.cargarCartera();
      this.whatsapp.status().subscribe((r) => this.estadoWhatsapp.set(r.estado));
      this.cargarConfigRecordatorios();
      this.comisionesService.configuracion().subscribe((c) => {
        this.recargoCuotasGlobal = Number(c.recargoCuotasGlobal);
      });
    }
  }

  nombreComprador(celular: string | null): string {
    if (!celular) return 'Anonimo';
    return this.compradores().find((c) => c.celular === celular)?.nombre ?? celular;
  }

  toggleExpandir(ventaId: number): void {
    this.ventaExpandidaId.set(this.ventaExpandidaId() === ventaId ? null : ventaId);
  }

  cargarCuotas(): void {
    this.cuotasService.listar().subscribe((data) => this.cuotas.set(data));
  }

  cargarCartera(): void {
    this.metrics.carteraCuotas().subscribe((data) => this.cartera.set(data));
  }

  cartera_totalPendiente(): string {
    const fila = this.cartera()?.resumen.find((r) => r.estado === 'pendiente');
    return MONEDA.format(Number(fila?.total ?? '0'));
  }

  cartera_totalAtrasado(): string {
    const fila = this.cartera()?.resumen.find((r) => r.estado === 'atrasada');
    return MONEDA.format(Number(fila?.total ?? '0'));
  }

  cartera_cantidadPendiente(): number {
    return this.cartera()?.resumen.find((r) => r.estado === 'pendiente')?.cantidad ?? 0;
  }

  cartera_cantidadAtrasada(): number {
    return this.cartera()?.resumen.find((r) => r.estado === 'atrasada')?.cantidad ?? 0;
  }

  pagarCuota(cuota: CuotaConVenta): void {
    this.pagandoCuotaId.set(cuota.id);
    this.cuotasService.pagar(cuota.id).subscribe({
      next: () => {
        this.pagandoCuotaId.set(null);
        this.cargarCuotas();
        if (this.auth.esManagerOAdmin()) this.cargarCartera();
      },
      error: (err) => {
        this.error.set(extractError(err));
        this.pagandoCuotaId.set(null);
      },
    });
  }

  editarFechaCuota(cuota: CuotaConVenta): void {
    this.editandoFechaCuotaId.set(cuota.id);
    this.nuevaFechaCuota = cuota.fechaVencimiento.slice(0, 10);
  }

  cancelarFechaCuota(): void {
    this.editandoFechaCuotaId.set(null);
  }

  guardarFechaCuota(cuota: CuotaConVenta): void {
    if (!this.nuevaFechaCuota) return;
    this.guardandoFechaCuotaId.set(cuota.id);
    this.cuotasService.actualizarFecha(cuota.id, this.nuevaFechaCuota).subscribe({
      next: () => {
        this.guardandoFechaCuotaId.set(null);
        this.editandoFechaCuotaId.set(null);
        this.cargarCuotas();
        if (this.auth.esManagerOAdmin()) this.cargarCartera();
      },
      error: (err) => {
        this.error.set(extractError(err));
        this.guardandoFechaCuotaId.set(null);
      },
    });
  }

  // --- Recordatorios automaticos (movido de la pagina de WhatsApp) ---

  cargarConfigRecordatorios(): void {
    this.whatsapp.obtenerConfig().subscribe((c) => {
      this.recordatoriosActivos.set(c.recordatoriosCuotasActivos);
      this.limiteMensajesHora = c.limiteMensajesHora;
      this.limiteMensajesDia = c.limiteMensajesDia;
    });
  }

  toggleRecordatorios(): void {
    const nuevoValor = !this.recordatoriosActivos();
    this.guardandoConfig.set(true);
    this.whatsapp.actualizarConfig({ recordatoriosCuotasActivos: nuevoValor }).subscribe({
      next: (c) => {
        this.recordatoriosActivos.set(c.recordatoriosCuotasActivos);
        this.guardandoConfig.set(false);
      },
      error: (err) => {
        this.error.set(extractError(err));
        this.guardandoConfig.set(false);
      },
    });
  }

  guardarLimites(): void {
    this.guardandoLimites.set(true);
    this.limitesGuardados.set(false);
    this.whatsapp
      .actualizarConfig({ limiteMensajesHora: this.limiteMensajesHora, limiteMensajesDia: this.limiteMensajesDia })
      .subscribe({
        next: (c) => {
          this.limiteMensajesHora = c.limiteMensajesHora;
          this.limiteMensajesDia = c.limiteMensajesDia;
          this.guardandoLimites.set(false);
          this.limitesGuardados.set(true);
        },
        error: (err) => {
          this.error.set(extractError(err));
          this.guardandoLimites.set(false);
        },
      });
  }

  enviarRecordatoriosAhora(): void {
    this.error.set(null);
    this.exito.set(null);
    this.enviandoRecordatorios.set(true);
    this.whatsapp.enviarRecordatoriosAhora().subscribe({
      next: () => {
        this.exito.set('Recordatorios de cuotas procesados');
        this.enviandoRecordatorios.set(false);
        this.cargarCuotas();
      },
      error: (err) => {
        this.error.set(extractError(err));
        this.enviandoRecordatorios.set(false);
      },
    });
  }

  // --- Recargo por cuotas por defecto (movido de la pagina de Comisiones) ---

  guardarRecargo(): void {
    if (this.recargoCuotasGlobal === null || this.recargoCuotasGlobal < 0) {
      this.error.set('El recargo por cuotas debe ser un valor valido');
      return;
    }
    this.error.set(null);
    this.exito.set(null);
    this.guardandoRecargo.set(true);
    this.comisionesService.actualizarConfiguracion(this.recargoCuotasGlobal).subscribe({
      next: () => {
        this.exito.set('Recargo por cuotas actualizado');
        this.guardandoRecargo.set(false);
      },
      error: (err) => {
        this.error.set(extractError(err));
        this.guardandoRecargo.set(false);
      },
    });
  }
}
