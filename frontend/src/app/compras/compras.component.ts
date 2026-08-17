import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { Categoria, CompraInventario, Producto } from '../models/domain.models';
import { ComprasService } from '../services/compras.service';
import { ProductosService } from '../services/productos.service';
import { extractError } from '../shared/http-error';
import { ProductoSelectorComponent } from '../shared/producto-selector/producto-selector.component';

interface CompraForm {
  codigoProducto: string;
  cantidad: number | null;
  valorCompraUnitario: number | null;
  proveedor: string;
}

interface EdicionCompraForm {
  codigoProducto: string;
  cantidad: number | null;
  valorCompraUnitario: number | null;
  proveedor: string;
  fechaCompra: string;
  valorVenta: number | null;
  categoria: Categoria;
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
  categoria: '',
  valorVenta: null,
  stockMinimo: 0,
};

@Component({
  selector: 'app-compras',
  imports: [FormsModule, DatePipe, RouterLink, ProductoSelectorComponent],
  templateUrl: './compras.component.html',
  styleUrl: './compras.component.scss',
})
export class ComprasComponent implements OnInit {
  productos = signal<Producto[]>([]);
  compras = signal<CompraInventario[]>([]);
  error = signal<string | null>(null);
  exito = signal<string | null>(null);
  guardando = signal(false);

  // Categoria es texto libre; se sugieren las que ya estan en uso en vez de una lista fija.
  categoriasSugeridas = computed(() => {
    const set = new Set(this.productos().map((p) => p.categoria).filter(Boolean));
    return Array.from(set).sort();
  });

  esProductoNuevo = signal(false);

  form: CompraForm = { ...FORM_VACIO };
  productoNuevo: ProductoNuevoForm = { ...PRODUCTO_NUEVO_VACIO };

  editandoCompraId = signal<number | null>(null);
  guardandoEdicion = signal(false);
  formEdicion: EdicionCompraForm = {
    codigoProducto: '',
    cantidad: null,
    valorCompraUnitario: null,
    proveedor: '',
    fechaCompra: '',
    valorVenta: null,
    categoria: '',
  };

  busqueda = signal('');
  comprasFiltradas = computed(() => {
    const q = this.busqueda().trim().toLowerCase();
    if (!q) return this.compras();
    return this.compras().filter((c) => {
      const p = this.producto(c.codigoProducto);
      return c.codigoProducto.toLowerCase().includes(q) || (p?.nombre.toLowerCase().includes(q) ?? false);
    });
  });

  // Autocompletado de la barra de busqueda: nombre y codigo de los productos ya registrados.
  busquedaSugerencias = computed(() => {
    const set = new Set<string>();
    for (const p of this.productos()) {
      set.add(p.nombre);
      set.add(p.codigo);
    }
    return Array.from(set).sort();
  });

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

  producto(codigo: string): Producto | undefined {
    return this.productos().find((p) => p.codigo === codigo);
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
            this.esProductoNuevo() ? `Producto ${codigoProducto} creado y compra registrada` : 'Compra registrada',
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

  editarCompra(c: CompraInventario): void {
    this.editandoCompraId.set(c.id);
    const p = this.producto(c.codigoProducto);
    this.formEdicion = {
      codigoProducto: c.codigoProducto,
      cantidad: c.cantidad,
      valorCompraUnitario: Number(c.valorCompraUnitario),
      proveedor: c.proveedor ?? '',
      fechaCompra: c.fechaCompra.slice(0, 10),
      valorVenta: p ? Number(p.valorVenta) : null,
      categoria: p?.categoria ?? '',
    };
    this.error.set(null);
    this.exito.set(null);
  }

  // Al reasignar la compra a otro producto, el precio/categoria mostrados deben reflejar el
  // producto recien seleccionado, no quedar con los valores del producto original.
  onCambioProductoEdicion(): void {
    const p = this.producto(this.formEdicion.codigoProducto);
    if (!p) return;
    this.formEdicion.valorVenta = Number(p.valorVenta);
    this.formEdicion.categoria = p.categoria;
  }

  cancelarEdicionCompra(): void {
    this.editandoCompraId.set(null);
  }

  guardarEdicionCompra(): void {
    const id = this.editandoCompraId();
    if (!id) return;
    this.error.set(null);
    this.exito.set(null);

    if (
      !this.formEdicion.codigoProducto ||
      !this.formEdicion.cantidad ||
      !this.formEdicion.valorCompraUnitario ||
      !this.formEdicion.fechaCompra ||
      this.formEdicion.valorVenta === null ||
      !this.formEdicion.categoria
    ) {
      this.error.set('Producto, cantidad, valor unitario, fecha, categoria y valor de venta son obligatorios');
      return;
    }

    this.guardandoEdicion.set(true);
    this.comprasService
      .actualizar(id, {
        codigoProducto: this.formEdicion.codigoProducto,
        cantidad: this.formEdicion.cantidad,
        valorCompraUnitario: this.formEdicion.valorCompraUnitario,
        proveedor: this.formEdicion.proveedor || undefined,
        fechaCompra: this.formEdicion.fechaCompra,
      })
      .subscribe({
        next: () => {
          // Categoria y valor de venta son datos del producto, no de la compra en si - se
          // guardan aparte contra /api/productos una vez la compra quedo bien.
          this.productosService
            .actualizar(this.formEdicion.codigoProducto, {
              categoria: this.formEdicion.categoria,
              valorVenta: this.formEdicion.valorVenta as number,
            })
            .subscribe({
              next: () => {
                this.exito.set('Compra actualizada');
                this.guardandoEdicion.set(false);
                this.editandoCompraId.set(null);
                this.cargarCompras();
                this.productosService.listar().subscribe((data) => this.productos.set(data));
              },
              error: (err) => {
                this.error.set(extractError(err));
                this.guardandoEdicion.set(false);
                this.cargarCompras();
                this.productosService.listar().subscribe((data) => this.productos.set(data));
              },
            });
        },
        error: (err) => {
          this.error.set(extractError(err));
          this.guardandoEdicion.set(false);
        },
      });
  }
}
