import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Categoria, Producto } from '../models/domain.models';
import { AuthService } from '../services/auth.service';
import { ProductosService } from '../services/productos.service';
import { extractError } from '../shared/http-error';

interface EdicionProducto {
  nombre: string;
  categoria: Categoria;
  valorVenta: number | null;
  stockMinimo: number | null;
}

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

  form: EdicionProducto = { nombre: '', categoria: 'arete', valorVenta: null, stockMinimo: 0 };

  constructor(
    private productosService: ProductosService,
    protected auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  get puedeEditar(): boolean {
    return this.auth.esManagerOAdmin();
  }

  cargar(): void {
    this.productosService.listar().subscribe((data) => this.productos.set(data));
  }

  editar(producto: Producto): void {
    this.editandoCodigo.set(producto.codigo);
    this.form = {
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
  }

  guardar(): void {
    this.error.set(null);
    this.exito.set(null);

    const editando = this.editandoCodigo();
    if (!editando || !this.form.nombre || this.form.valorVenta === null) {
      this.error.set('Nombre y valor de venta son obligatorios');
      return;
    }

    this.guardando.set(true);
    this.productosService
      .actualizar(editando, {
        nombre: this.form.nombre,
        categoria: this.form.categoria,
        valorVenta: this.form.valorVenta,
        stockMinimo: this.form.stockMinimo ?? 0,
      })
      .subscribe({
        next: () => {
          this.exito.set('Producto actualizado');
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
