import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { CompraInventario, Producto } from '../models/domain.models';
import { ComprasService } from '../services/compras.service';
import { ProductosService } from '../services/productos.service';
import { extractError } from '../shared/http-error';

interface CompraForm {
  codigoProducto: string;
  cantidad: number | null;
  valorCompraUnitario: number | null;
  proveedor: string;
}

const FORM_VACIO: CompraForm = {
  codigoProducto: '',
  cantidad: null,
  valorCompraUnitario: null,
  proveedor: '',
};

@Component({
  selector: 'app-compras',
  imports: [FormsModule, DatePipe],
  templateUrl: './compras.component.html',
  styleUrl: './compras.component.scss',
})
export class ComprasComponent implements OnInit {
  productos = signal<Producto[]>([]);
  compras = signal<CompraInventario[]>([]);
  error = signal<string | null>(null);
  exito = signal<string | null>(null);
  guardando = signal(false);

  form: CompraForm = { ...FORM_VACIO };

  constructor(
    private comprasService: ComprasService,
    private productosService: ProductosService,
  ) {}

  ngOnInit(): void {
    this.productosService.listar().subscribe((data) => this.productos.set(data));
    this.cargarCompras();
  }

  cargarCompras(): void {
    this.comprasService.listar().subscribe((data) => this.compras.set(data));
  }

  nombreProducto(codigo: string): string {
    return this.productos().find((p) => p.codigo === codigo)?.nombre ?? codigo;
  }

  registrar(): void {
    this.error.set(null);
    this.exito.set(null);

    if (!this.form.codigoProducto || !this.form.cantidad || !this.form.valorCompraUnitario) {
      this.error.set('Producto, cantidad y valor de compra son obligatorios');
      return;
    }

    this.guardando.set(true);
    this.comprasService
      .registrar({
        codigoProducto: this.form.codigoProducto,
        cantidad: this.form.cantidad,
        valorCompraUnitario: this.form.valorCompraUnitario,
        proveedor: this.form.proveedor || undefined,
      })
      .subscribe({
        next: () => {
          this.exito.set('Compra registrada — costo promedio actualizado');
          this.guardando.set(false);
          this.form = { ...FORM_VACIO };
          this.cargarCompras();
          this.productosService.listar().subscribe((data) => this.productos.set(data));
        },
        error: (err) => {
          this.error.set(extractError(err));
          this.guardando.set(false);
        },
      });
  }
}
