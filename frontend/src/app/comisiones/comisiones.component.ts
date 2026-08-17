import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Liquidacion, ResumenComisionVendedor, VentaPendienteComision } from '../models/domain.models';
import { ComisionesService } from '../services/comisiones.service';
import { extractError } from '../shared/http-error';
import { resumenProductosVenta } from '../shared/venta-resumen';

@Component({
  selector: 'app-comisiones',
  imports: [DatePipe, FormsModule],
  templateUrl: './comisiones.component.html',
  styleUrl: './comisiones.component.scss',
})
export class ComisionesComponent implements OnInit {
  resumenProductosVenta = resumenProductosVenta;

  resumen = signal<ResumenComisionVendedor[]>([]);
  liquidaciones = signal<Liquidacion[]>([]);
  detalleVendedorId = signal<number | null>(null);
  ventasPendientesDetalle = signal<VentaPendienteComision[]>([]);
  liquidandoId = signal<number | null>(null);
  error = signal<string | null>(null);
  exito = signal<string | null>(null);

  recargoCuotasGlobal: number | null = null;
  guardandoRecargo = signal(false);

  constructor(private comisionesService: ComisionesService) {}

  ngOnInit(): void {
    this.cargar();
    this.comisionesService.configuracion().subscribe((c) => {
      this.recargoCuotasGlobal = Number(c.recargoCuotasGlobal);
    });
  }

  cargar(): void {
    this.comisionesService.resumen().subscribe((data) => this.resumen.set(data));
    this.comisionesService.liquidaciones().subscribe((data) => this.liquidaciones.set(data));
  }

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

  verDetalle(vendedorId: number): void {
    if (this.detalleVendedorId() === vendedorId) {
      this.detalleVendedorId.set(null);
      return;
    }
    this.detalleVendedorId.set(vendedorId);
    this.comisionesService.pendientesDeVendedor(vendedorId).subscribe((data) => this.ventasPendientesDetalle.set(data));
  }

  liquidar(fila: ResumenComisionVendedor): void {
    if (
      !confirm(
        `¿Liquidar ${fila.cantidadVentas} venta(s) de ${fila.vendedorNombre} por un total de ${fila.totalComision}? Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }
    this.error.set(null);
    this.exito.set(null);
    this.liquidandoId.set(fila.vendedorId);
    this.comisionesService.liquidar(fila.vendedorId).subscribe({
      next: (liquidacion) => {
        this.exito.set(`Liquidación #${liquidacion.id} generada para ${fila.vendedorNombre}`);
        this.liquidandoId.set(null);
        this.detalleVendedorId.set(null);
        this.cargar();
      },
      error: (err) => {
        this.error.set(extractError(err));
        this.liquidandoId.set(null);
      },
    });
  }

  descargarPdf(liquidacion: Liquidacion): void {
    window.open(this.comisionesService.urlPdf(liquidacion.id), '_blank');
  }
}
