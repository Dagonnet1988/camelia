import { Component, OnInit, computed, signal } from '@angular/core';
import type { ChartConfiguration } from 'chart.js/auto';
import { catchError, of } from 'rxjs';
import type {
  AbcItem,
  CarteraCuotasResponse,
  ContadoVsCuotasResponse,
  CostoProveedorGroup,
  GananciaAcumuladaItem,
  MargenProducto,
  RotacionInventarioResponse,
  StockMuertoItem,
  TicketPromedioResponse,
  TopProductosResponse,
} from '../models/metrics.models';
import { MetricsService } from '../services/metrics.service';
import { getChartTheme } from '../shared/colors';
import {
  lineConfig,
  multiLineConfig,
  sequentialBarConfig,
} from '../shared/chart/chart-presets';
import { ChartComponent } from '../shared/chart/chart.component';
import { StatTileComponent } from '../shared/stat-tile/stat-tile.component';

const MONEDA = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});
const FECHA = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const MES = new Intl.DateTimeFormat('es-CO', { month: 'short', year: 'numeric', timeZone: 'UTC' });

@Component({
  selector: 'app-dashboard',
  imports: [ChartComponent, StatTileComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private theme = getChartTheme();

  rotacionDias = signal(30);
  gananciaPeriodo = signal<'semana' | 'mes'>('mes');
  stockMuertoDias = signal(30);

  topProductos = signal<TopProductosResponse | undefined>(undefined);
  topProductosUnidadesChart = signal<ChartConfiguration | undefined>(undefined);
  topProductosIngresosChart = signal<ChartConfiguration | undefined>(undefined);

  margenProductos = signal<MargenProducto[] | undefined>(undefined);
  margenChart = signal<ChartConfiguration | undefined>(undefined);
  margenTotales = computed(() => {
    const items = this.margenProductos() ?? [];
    return {
      valorVenta: items.reduce((acc, p) => acc + Number(p.valorVenta), 0),
      costoCompra: items.reduce((acc, p) => acc + Number(p.costoCompra), 0),
    };
  });

  rotacion = signal<RotacionInventarioResponse | undefined>(undefined);
  rotacionProductoChart = signal<ChartConfiguration | undefined>(undefined);
  rotacionCategoriaChart = signal<ChartConfiguration | undefined>(undefined);

  gananciaAcumulada = signal<GananciaAcumuladaItem[] | undefined>(undefined);
  gananciaPeriodoChart = signal<ChartConfiguration | undefined>(undefined);
  gananciaAcumuladaChart = signal<ChartConfiguration | undefined>(undefined);

  abc = signal<AbcItem[] | undefined>(undefined);

  ticket = signal<TicketPromedioResponse | undefined>(undefined);

  contadoVsCuotas = signal<ContadoVsCuotasResponse | undefined>(undefined);

  cartera = signal<CarteraCuotasResponse | undefined>(undefined);

  stockMuerto = signal<StockMuertoItem[] | undefined>(undefined);

  costosProveedorCharts = signal<{ proveedor: string; config: ChartConfiguration }[]>([]);

  constructor(private metrics: MetricsService) {}

  ngOnInit(): void {
    this.cargarTopProductos();
    this.cargarMargenProductos();
    this.cargarRotacion();
    this.cargarGananciaAcumulada();
    this.cargarAbc();
    this.cargarTicketPromedio();
    this.cargarContadoVsCuotas();
    this.cargarCarteraCuotas();
    this.cargarStockMuerto();
    this.cargarCostosProveedor();
  }

  cargarTopProductos(): void {
    this.metrics
      .topProductos(8)
      .pipe(catchError(() => of(undefined)))
      .subscribe((data) => {
        this.topProductos.set(data);
        if (!data) return;
        this.topProductosUnidadesChart.set(
          sequentialBarConfig(
            this.theme,
            data.porUnidades.map((p) => p.nombre),
            data.porUnidades.map((p) => p.unidadesVendidas),
            true,
          ),
        );
        this.topProductosIngresosChart.set(
          sequentialBarConfig(
            this.theme,
            data.porIngresos.map((p) => p.nombre),
            data.porIngresos.map((p) => Number(p.ingresos)),
            true,
          ),
        );
      });
  }

  cargarMargenProductos(): void {
    this.metrics
      .margenProductos()
      .pipe(catchError(() => of(undefined)))
      .subscribe((data) => {
        this.margenProductos.set(data);
        if (!data) return;
        const top = data.slice(0, 8);
        this.margenChart.set(
          sequentialBarConfig(
            this.theme,
            top.map((p) => p.nombre),
            top.map((p) => Number(p.margen) * 100),
            true,
          ),
        );
      });
  }

  cargarRotacion(): void {
    this.metrics
      .rotacionInventario(this.rotacionDias())
      .pipe(catchError(() => of(undefined)))
      .subscribe((data) => {
        this.rotacion.set(data);
        if (!data) return;
        const topProducto = data.porProducto.slice(0, 8);
        this.rotacionProductoChart.set(
          sequentialBarConfig(
            this.theme,
            topProducto.map((p) => p.nombre),
            topProducto.map((p) => Number(p.rotacionDiaria)),
            true,
          ),
        );
        this.rotacionCategoriaChart.set(
          sequentialBarConfig(
            this.theme,
            data.porCategoria.map((c) => c.categoria),
            data.porCategoria.map((c) => Number(c.rotacionDiaria)),
          ),
        );
      });
  }

  cambiarRotacionDias(dias: number): void {
    this.rotacionDias.set(dias);
    this.cargarRotacion();
  }

  cargarGananciaAcumulada(): void {
    this.metrics
      .gananciaAcumulada(this.gananciaPeriodo())
      .pipe(catchError(() => of(undefined)))
      .subscribe((data) => {
        this.gananciaAcumulada.set(data);
        if (!data) return;
        const labels = data.map((d) => this.formatPeriodo(d.periodo));
        this.gananciaPeriodoChart.set(
          sequentialBarConfig(
            this.theme,
            labels,
            data.map((d) => Number(d.ganancia)),
          ),
        );
        this.gananciaAcumuladaChart.set(
          lineConfig(
            this.theme,
            labels,
            data.map((d) => Number(d.gananciaAcumulada)),
          ),
        );
      });
  }

  cambiarGananciaPeriodo(periodo: 'semana' | 'mes'): void {
    this.gananciaPeriodo.set(periodo);
    this.cargarGananciaAcumulada();
  }

  cargarAbc(): void {
    this.metrics
      .abc()
      .pipe(catchError(() => of(undefined)))
      .subscribe((data) => this.abc.set(data));
  }

  cargarTicketPromedio(): void {
    this.metrics
      .ticketPromedio()
      .pipe(catchError(() => of(undefined)))
      .subscribe((data) => this.ticket.set(data));
  }

  cargarContadoVsCuotas(): void {
    this.metrics
      .contadoVsCuotas()
      .pipe(catchError(() => of(undefined)))
      .subscribe((data) => this.contadoVsCuotas.set(data));
  }

  cargarCarteraCuotas(): void {
    this.metrics
      .carteraCuotas()
      .pipe(catchError(() => of(undefined)))
      .subscribe((data) => this.cartera.set(data));
  }

  cargarStockMuerto(): void {
    this.metrics
      .stockMuerto(this.stockMuertoDias())
      .pipe(catchError(() => of(undefined)))
      .subscribe((data) => this.stockMuerto.set(data));
  }

  cambiarStockMuertoDias(dias: number): void {
    this.stockMuertoDias.set(dias);
    this.cargarStockMuerto();
  }

  cargarCostosProveedor(): void {
    this.metrics
      .costosProveedor()
      .pipe(catchError(() => of(undefined)))
      .subscribe((data) => {
        if (!data) return;
        this.costosProveedorCharts.set(
          data.map((grupo) => {
            const productos = [...new Set(grupo.historico.map((h) => h.codigoProducto))].slice(0, 4);
            const fechas = [...new Set(grupo.historico.map((h) => h.fechaCompra))].sort();
            const series = productos.map((codigo) => ({
              label: codigo,
              data: fechas.map((fecha) => {
                const compra = grupo.historico.find(
                  (h) => h.codigoProducto === codigo && h.fechaCompra === fecha,
                );
                return compra ? Number(compra.valorCompraUnitario) : null;
              }),
            }));
            return {
              proveedor: grupo.proveedor,
              config: multiLineConfig(this.theme, fechas.map((f) => this.formatFecha(f)), series),
            };
          }),
        );
      });
  }

  cartera_totalPendiente(): string {
    const fila = this.cartera()?.resumen.find((r) => r.estado === 'pendiente');
    return this.formatMoneda(fila?.total ?? '0');
  }

  cartera_totalAtrasado(): string {
    const fila = this.cartera()?.resumen.find((r) => r.estado === 'atrasada');
    return this.formatMoneda(fila?.total ?? '0');
  }

  cartera_cantidadPendiente(): number {
    return this.cartera()?.resumen.find((r) => r.estado === 'pendiente')?.cantidad ?? 0;
  }

  cartera_cantidadAtrasada(): number {
    return this.cartera()?.resumen.find((r) => r.estado === 'atrasada')?.cantidad ?? 0;
  }

  formatMoneda(valor: string | number): string {
    return MONEDA.format(Number(valor));
  }

  formatPorcentaje(valor: string | number): string {
    return `${(Number(valor) * 100).toFixed(1)}%`;
  }

  formatFecha(iso: string): string {
    return FECHA.format(new Date(iso));
  }

  formatPeriodo(iso: string): string {
    return MES.format(new Date(iso));
  }
}
