import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Categoria, CompraInventario, Producto } from '../models/domain.models';
import { ComprasService } from '../services/compras.service';
import { ProductosService } from '../services/productos.service';
import { extractError } from '../shared/http-error';

interface CompraForm {
  codigoProducto: string;
  cantidad: number | null;
  valorCompraUnitario: number | null;
  proveedor: string;
}

interface ProductoNuevoForm {
  codigo: string;
  nombre: string;
  categoria: Categoria;
  valorVenta: number | null;
  stockMinimo: number | null;
}

const FORM_VACIO: CompraForm = {
  codigoProducto: '',
  cantidad: null,
  valorCompraUnitario: null,
  proveedor: '',
};

const PRODUCTO_NUEVO_VACIO: ProductoNuevoForm = {
  codigo: '',
  nombre: '',
  categoria: 'arete',
  valorVenta: null,
  stockMinimo: 0,
};

@Component({
  selector: 'app-compras',
  imports: [FormsModule, DatePipe],
  templateUrl: './compras.component.html',
  styleUrl: './compras.component.scss',
})
export class ComprasComponent implements OnInit {
  categorias: Categoria[] = ['arete', 'anillo', 'manilla', 'collar', 'otro'];

  productos = signal<Producto[]>([]);
  compras = signal<CompraInventario[]>([]);
  error = signal<string | null>(null);
  exito = signal<string | null>(null);
  guardando = signal(false);

  esProductoNuevo = signal(false);

  form: CompraForm = { ...FORM_VACIO };
  productoNuevo: ProductoNuevoForm = { ...PRODUCTO_NUEVO_VACIO };

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

  toggleProductoNuevo(valor: boolean): void {
    this.esProductoNuevo.set(valor);
    this.form.codigoProducto = '';
    this.productoNuevo = { ...PRODUCTO_NUEVO_VACIO };
  }

  registrar(): void {
    this.error.set(null);
    this.exito.set(null);

    const codigoProducto = this.esProductoNuevo() ? this.productoNuevo.codigo : this.form.codigoProducto;

    if (!codigoProducto || !this.form.cantidad || !this.form.valorCompraUnitario) {
      this.error.set('Producto, cantidad y valor de compra son obligatorios');
      return;
    }
    if (this.esProductoNuevo() && (!this.productoNuevo.nombre || this.productoNuevo.valorVenta === null)) {
      this.error.set('Nombre y valor de venta del producto nuevo son obligatorios');
      return;
    }

    this.guardando.set(true);
    this.comprasService
      .registrar({
        codigoProducto,
        cantidad: this.form.cantidad,
        valorCompraUnitario: this.form.valorCompraUnitario,
        proveedor: this.form.proveedor || undefined,
        productoNuevo: this.esProductoNuevo()
          ? {
              nombre: this.productoNuevo.nombre,
              categoria: this.productoNuevo.categoria,
              valorVenta: this.productoNuevo.valorVenta as number,
              stockMinimo: this.productoNuevo.stockMinimo ?? 0,
            }
          : undefined,
      })
      .subscribe({
        next: () => {
          this.exito.set(
            this.esProductoNuevo()
              ? `Producto ${codigoProducto} creado y compra registrada`
              : 'Compra registrada — costo promedio actualizado',
          );
          this.guardando.set(false);
          this.form = { ...FORM_VACIO };
          this.productoNuevo = { ...PRODUCTO_NUEVO_VACIO };
          this.esProductoNuevo.set(false);
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
