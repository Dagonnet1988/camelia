import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Canal, Comprador, MedioPago, Producto, Venta } from '../models/domain.models';
import { CompradoresService } from '../services/compradores.service';
import { ProductosService } from '../services/productos.service';
import { VentasService } from '../services/ventas.service';
import { extractError } from '../shared/http-error';

interface VentaForm {
  codigoProducto: string;
  compradorCelular: string;
  cantidad: number | null;
  medioPago: MedioPago;
  numCuotas: number;
  recargoCuotas: number | null;
  canal: Canal;
}

const FORM_VACIO: VentaForm = {
  codigoProducto: '',
  compradorCelular: '',
  cantidad: null,
  medioPago: 'contado',
  numCuotas: 1,
  recargoCuotas: null,
  canal: 'whatsapp',
};

@Component({
  selector: 'app-ventas',
  imports: [FormsModule, DatePipe],
  templateUrl: './ventas.component.html',
  styleUrl: './ventas.component.scss',
})
export class VentasComponent implements OnInit {
  productos = signal<Producto[]>([]);
  compradores = signal<Comprador[]>([]);
  ventas = signal<Venta[]>([]);
  error = signal<string | null>(null);
  exito = signal<string | null>(null);
  guardando = signal(false);

  form: VentaForm = { ...FORM_VACIO };

  constructor(
    private ventasService: VentasService,
    private productosService: ProductosService,
    private compradoresService: CompradoresService,
  ) {}

  ngOnInit(): void {
    this.productosService.listar().subscribe((data) => this.productos.set(data));
    this.compradoresService.listar().subscribe((data) => this.compradores.set(data));
    this.cargarVentas();
  }

  cargarVentas(): void {
    this.ventasService.listar().subscribe((data) => this.ventas.set(data));
  }

  nombreProducto(codigo: string): string {
    return this.productos().find((p) => p.codigo === codigo)?.nombre ?? codigo;
  }

  nombreComprador(celular: string | null): string {
    if (!celular) return 'Anonimo';
    return this.compradores().find((c) => c.celular === celular)?.nombre ?? celular;
  }

  registrar(): void {
    this.error.set(null);
    this.exito.set(null);

    if (!this.form.codigoProducto || !this.form.cantidad) {
      this.error.set('Producto y cantidad son obligatorios');
      return;
    }
    if (this.form.medioPago === 'cuotas' && !this.form.numCuotas) {
      this.error.set('num_cuotas es obligatorio para ventas a cuotas');
      return;
    }

    this.guardando.set(true);
    this.ventasService
      .registrar({
        codigoProducto: this.form.codigoProducto,
        compradorCelular: this.form.compradorCelular || undefined,
        cantidad: this.form.cantidad,
        medioPago: this.form.medioPago,
        numCuotas: this.form.medioPago === 'cuotas' ? this.form.numCuotas : undefined,
        recargoCuotas: this.form.medioPago === 'cuotas' ? (this.form.recargoCuotas ?? 0) : undefined,
        canal: this.form.canal,
      })
      .subscribe({
        next: (venta) => {
          this.exito.set(
            `Venta #${venta.id} registrada — total ${venta.valorTotalVenta}, ganancia ${venta.ganancia}`,
          );
          this.guardando.set(false);
          this.form = { ...FORM_VACIO };
          this.cargarVentas();
          this.productosService.listar().subscribe((data) => this.productos.set(data));
        },
        error: (err) => {
          this.error.set(extractError(err));
          this.guardando.set(false);
        },
      });
  }
}
