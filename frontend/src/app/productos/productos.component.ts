import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Categoria, Producto } from '../models/domain.models';
import { ProductosService } from '../services/productos.service';
import { extractError } from '../shared/http-error';

interface ProductoForm {
  codigo: string;
  nombre: string;
  categoria: Categoria;
  valorVenta: number | null;
  stockMinimo: number | null;
}

const FORM_VACIO: ProductoForm = {
  codigo: '',
  nombre: '',
  categoria: 'arete',
  valorVenta: null,
  stockMinimo: 0,
};

@Component({
  selector: 'app-productos',
  imports: [FormsModule],
  templateUrl: './productos.component.html',
  styleUrl: './productos.component.scss',
})
export class ProductosComponent implements OnInit {
  categorias: Categoria[] = ['arete', 'anillo', 'manilla', 'collar', 'otro'];

  productos = signal<Producto[]>([]);
  editandoCodigo = signal<string | null>(null);
  error = signal<string | null>(null);
  exito = signal<string | null>(null);
  guardando = signal(false);

  form: ProductoForm = { ...FORM_VACIO };

  constructor(private productosService: ProductosService) {}

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.productosService.listar().subscribe((data) => this.productos.set(data));
  }

  editar(producto: Producto): void {
    this.editandoCodigo.set(producto.codigo);
    this.form = {
      codigo: producto.codigo,
      nombre: producto.nombre,
      categoria: producto.categoria,
      valorVenta: Number(producto.valorVenta),
      stockMinimo: producto.stockMinimo,
    };
    this.error.set(null);
    this.exito.set(null);
  }

  cancelarEdicion(): void {
    this.editandoCodigo.set(null);
    this.form = { ...FORM_VACIO };
  }

  guardar(): void {
    this.error.set(null);
    this.exito.set(null);

    if (!this.form.nombre || this.form.valorVenta === null) {
      this.error.set('Nombre y valor de venta son obligatorios');
      return;
    }

    this.guardando.set(true);
    const editando = this.editandoCodigo();

    const request = editando
      ? this.productosService.actualizar(editando, {
          nombre: this.form.nombre,
          categoria: this.form.categoria,
          valorVenta: this.form.valorVenta,
          stockMinimo: this.form.stockMinimo ?? 0,
        })
      : this.productosService.crear({
          codigo: this.form.codigo,
          nombre: this.form.nombre,
          categoria: this.form.categoria,
          valorVenta: this.form.valorVenta,
          stockMinimo: this.form.stockMinimo ?? 0,
        });

    request.subscribe({
      next: () => {
        this.exito.set(editando ? 'Producto actualizado' : 'Producto creado');
        this.guardando.set(false);
        this.cancelarEdicion();
        this.cargar();
      },
      error: (err) => {
        this.error.set(extractError(err));
        this.guardando.set(false);
      },
    });
  }

  eliminar(producto: Producto): void {
    if (!confirm(`¿Eliminar el producto ${producto.nombre} (${producto.codigo})?`)) return;
    this.productosService.eliminar(producto.codigo).subscribe({
      next: () => this.cargar(),
      error: (err) => this.error.set(extractError(err)),
    });
  }

  stockBajo(p: Producto): boolean {
    return p.stockActual <= p.stockMinimo;
  }
}
