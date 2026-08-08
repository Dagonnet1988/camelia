import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Categoria, FotoProducto, Producto } from '../models/domain.models';
import { AuthService } from '../services/auth.service';
import { ProductosService } from '../services/productos.service';
import { extractError } from '../shared/http-error';

interface EdicionProducto {
  nombre: string;
  categoria: Categoria;
  valorVenta: number | null;
  stockMinimo: number | null;
  proveedor: string;
}

@Component({
  selector: 'app-productos',
  imports: [FormsModule],
  templateUrl: './productos.component.html',
  styleUrl: './productos.component.scss',
})
export class ProductosComponent implements OnInit {
  productos = signal<Producto[]>([]);
  editandoCodigo = signal<string | null>(null);
  error = signal<string | null>(null);
  exito = signal<string | null>(null);
  guardando = signal(false);

  // Categoria es texto libre; se sugieren las que ya estan en uso en vez de una lista fija.
  categoriasSugeridas = computed(() => {
    const set = new Set(this.productos().map((p) => p.categoria).filter(Boolean));
    return Array.from(set).sort();
  });

  form: EdicionProducto = { nombre: '', categoria: '', valorVenta: null, stockMinimo: 0, proveedor: '' };

  archivosFoto: File[] = [];
  subiendoFotos = signal(false);

  constructor(
    private productosService: ProductosService,
    protected auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  get puedeEditar(): boolean {
    // Editar (incl. fotos) esta abierto a los 3 roles; eliminar sigue siendo manager/admin.
    return true;
  }

  get puedeEliminar(): boolean {
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
      proveedor: producto.proveedor ?? '',
    };
    this.error.set(null);
    this.exito.set(null);
  }

  cancelarEdicion(): void {
    this.editandoCodigo.set(null);
    this.archivosFoto = [];
  }

  get fotosDelProductoEditado(): FotoProducto[] {
    const codigo = this.editandoCodigo();
    return this.productos().find((p) => p.codigo === codigo)?.fotos ?? [];
  }

  onArchivosSeleccionados(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.archivosFoto = input.files ? Array.from(input.files) : [];
  }

  subirFotos(): void {
    const codigo = this.editandoCodigo();
    if (!codigo || this.archivosFoto.length === 0) return;

    this.subiendoFotos.set(true);
    this.productosService.subirFotos(codigo, this.archivosFoto).subscribe({
      next: () => {
        this.subiendoFotos.set(false);
        this.archivosFoto = [];
        this.cargar();
      },
      error: (err) => {
        this.error.set(extractError(err));
        this.subiendoFotos.set(false);
      },
    });
  }

  eliminarFoto(foto: FotoProducto): void {
    const codigo = this.editandoCodigo();
    if (!codigo) return;
    this.productosService.eliminarFoto(codigo, foto.id).subscribe({
      next: () => this.cargar(),
      error: (err) => this.error.set(extractError(err)),
    });
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
        proveedor: this.form.proveedor || undefined,
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

  comisionEstimada(p: Producto): number {
    const porcentaje = Number(this.auth.usuario()?.porcentajeComision ?? 0);
    return (Number(p.valorVenta) * porcentaje) / 100;
  }
}
