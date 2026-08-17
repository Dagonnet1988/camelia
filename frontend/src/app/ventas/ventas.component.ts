import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type {
  Canal,
  Comprador,
  FrecuenciaCuotas,
  LineaVentaEdicionInput,
  LineaVentaInput,
  MedioPago,
  Producto,
  Vendedor,
  Venta,
} from '../models/domain.models';
import { AuthService } from '../services/auth.service';
import { ComisionesService } from '../services/comisiones.service';
import { CompradoresService } from '../services/compradores.service';
import { ProductosService } from '../services/productos.service';
import { VentasService } from '../services/ventas.service';
import { extractError } from '../shared/http-error';
import { ProductoSelectorComponent } from '../shared/producto-selector/producto-selector.component';
import { resumenProductosVenta } from '../shared/venta-resumen';
import { previsualizarCuotas } from '../shared/cuotas-preview';

interface LineaVentaForm {
  id?: number; // presente = linea existente (edicion); ausente = linea nueva
  codigoProducto: string;
  cantidad: number | null;
  valorUnitario: number | null;
}

interface VentaForm {
  lineas: LineaVentaForm[];
  compradorCelular: string;
  medioPago: MedioPago;
  numCuotas: number;
  frecuenciaCuotas: FrecuenciaCuotas;
  recargoCuotas: number | null;
  canal: Canal;
  vendedorId: number | null;
}

interface CompradorNuevoForm {
  celular: string;
  nombre: string;
}

interface EdicionVentaForm {
  lineas: LineaVentaForm[];
  compradorCelular: string;
  medioPago: MedioPago;
  numCuotas: number;
  frecuenciaCuotas: FrecuenciaCuotas;
  recargoCuotas: number | null;
  canal: Canal;
  vendedorId: number | null;
}

function lineaVacia(): LineaVentaForm {
  return { codigoProducto: '', cantidad: null, valorUnitario: null };
}

function formVacio(): VentaForm {
  return {
    lineas: [lineaVacia()],
    compradorCelular: '',
    medioPago: 'contado',
    numCuotas: 1,
    frecuenciaCuotas: 'mensual',
    recargoCuotas: null,
    canal: 'whatsapp',
    vendedorId: null,
  };
}

const COMPRADOR_NUEVO_VACIO: CompradorNuevoForm = {
  celular: '',
  nombre: '',
};

@Component({
  selector: 'app-ventas',
  imports: [FormsModule, DatePipe, ProductoSelectorComponent, RouterLink],
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

  vendedores = signal<Vendedor[]>([]);
  filtroVendedorId: number | null = null;

  esCompradorNuevo = signal(false);

  editandoVentaId = signal<number | null>(null);
  guardandoEdicion = signal(false);
  formEdicion: EdicionVentaForm = {
    lineas: [lineaVacia()],
    compradorCelular: '',
    medioPago: 'contado',
    numCuotas: 1,
    frecuenciaCuotas: 'mensual',
    recargoCuotas: null,
    canal: 'whatsapp',
    vendedorId: null,
  };

  form: VentaForm = formVacio();
  compradorNuevo: CompradorNuevoForm = { ...COMPRADOR_NUEVO_VACIO };

  resumenProductosVenta = resumenProductosVenta;

  constructor(
    private ventasService: VentasService,
    private productosService: ProductosService,
    private compradoresService: CompradoresService,
    private comisionesService: ComisionesService,
    protected auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.productosService.listar().subscribe((data) => this.productos.set(data));
    this.compradoresService.listar().subscribe((data) => this.compradores.set(data));
    this.cargarVentas();
    if (this.auth.esManagerOAdmin()) {
      this.comisionesService.vendedores().subscribe((data) => this.vendedores.set(data));
      // Por defecto la venta queda a nombre de quien la registra; manager/admin puede cambiarlo.
      this.form.vendedorId = this.auth.usuario()?.id ?? null;
      // Prellena el recargo sugerido con el valor global - el endpoint de configuracion es
      // solo manager/admin, asi que para el rol 'user' el campo queda vacio (igual funciona:
      // si se deja vacio, el backend aplica el mismo valor global al guardar).
      this.comisionesService.configuracion().subscribe((c) => {
        this.form.recargoCuotas = Number(c.recargoCuotasGlobal);
      });
    }
  }

  // Vista previa del valor de cada cuota, en vivo mientras se arma la venta.
  previsualizar(lineas: LineaVentaForm[], recargoCuotas: number | null, numCuotas: number): number[] {
    return previsualizarCuotas(this.totalLineas(lineas) + (recargoCuotas ?? 0), numCuotas);
  }

  cargarVentas(): void {
    this.ventasService.listar(this.filtroVendedorId ?? undefined).subscribe((data) => this.ventas.set(data));
  }

  onFiltroVendedorChange(): void {
    this.cargarVentas();
  }

  nombreComprador(celular: string | null): string {
    if (!celular) return 'Anonimo';
    return this.compradores().find((c) => c.celular === celular)?.nombre ?? celular;
  }

  cantidadTotal(v: Venta): number {
    return v.items.reduce((acc, i) => acc + i.cantidad, 0);
  }

  toggleCompradorNuevo(valor: boolean): void {
    this.esCompradorNuevo.set(valor);
    this.form.compradorCelular = '';
    this.compradorNuevo = { ...COMPRADOR_NUEVO_VACIO };
  }

  // Al elegir (o cambiar) el producto de una linea, sugiere su precio de catalogo - queda
  // editable despues por si aplica un descuento puntual a esa linea.
  actualizarPrecioSugerido(linea: LineaVentaForm): void {
    const producto = this.productos().find((p) => p.codigo === linea.codigoProducto);
    if (producto) linea.valorUnitario = Number(producto.valorVenta);
  }

  totalLineas(lineas: LineaVentaForm[]): number {
    return lineas.reduce((acc, l) => acc + (Number(l.valorUnitario ?? 0) * (l.cantidad ?? 0)), 0);
  }

  agregarLinea(lineas: LineaVentaForm[]): void {
    lineas.push(lineaVacia());
  }

  quitarLinea(lineas: LineaVentaForm[], index: number): void {
    if (lineas.length === 1) return;
    lineas.splice(index, 1);
  }

  registrar(): void {
    this.error.set(null);
    this.exito.set(null);

    const items: LineaVentaInput[] = [];
    for (const [i, l] of this.form.lineas.entries()) {
      if (!l.codigoProducto || !l.cantidad) {
        this.error.set(`Linea ${i + 1}: producto y cantidad son obligatorios`);
        return;
      }
      items.push({
        codigoProducto: l.codigoProducto,
        cantidad: l.cantidad,
        valorUnitario: l.valorUnitario ?? undefined,
      });
    }
    if (this.form.medioPago === 'cuotas' && !this.form.numCuotas) {
      this.error.set('num_cuotas es obligatorio para ventas a cuotas');
      return;
    }
    if (this.esCompradorNuevo() && (!this.compradorNuevo.celular || !this.compradorNuevo.nombre)) {
      this.error.set('Celular y nombre del cliente nuevo son obligatorios');
      return;
    }

    this.guardando.set(true);
    this.ventasService
      .registrar({
        items,
        compradorCelular: this.esCompradorNuevo() ? this.compradorNuevo.celular : this.form.compradorCelular || undefined,
        compradorNuevo: this.esCompradorNuevo() ? { nombre: this.compradorNuevo.nombre } : undefined,
        medioPago: this.form.medioPago,
        numCuotas: this.form.medioPago === 'cuotas' ? this.form.numCuotas : undefined,
        frecuenciaCuotas: this.form.medioPago === 'cuotas' ? this.form.frecuenciaCuotas : undefined,
        recargoCuotas: this.form.medioPago === 'cuotas' ? (this.form.recargoCuotas ?? undefined) : undefined,
        canal: this.form.canal,
        vendedorId: this.auth.esManagerOAdmin() ? (this.form.vendedorId ?? undefined) : undefined,
      })
      .subscribe({
        next: (venta) => {
          this.exito.set(
            this.auth.esManagerOAdmin()
              ? `Venta #${venta.id} registrada — total ${venta.valorTotalVenta}, ganancia ${venta.ganancia}`
              : `Venta #${venta.id} registrada — total ${venta.valorTotalVenta}`,
          );
          this.guardando.set(false);
          const vendedorPrevio = this.form.vendedorId;
          const recargoPrevio = this.form.recargoCuotas;
          this.form = { ...formVacio(), vendedorId: vendedorPrevio, recargoCuotas: recargoPrevio };
          this.esCompradorNuevo.set(false);
          this.compradorNuevo = { ...COMPRADOR_NUEVO_VACIO };
          this.cargarVentas();
          this.productosService.listar().subscribe((data) => this.productos.set(data));
          this.compradoresService.listar().subscribe((data) => this.compradores.set(data));
        },
        error: (err) => {
          this.error.set(extractError(err));
          this.guardando.set(false);
        },
      });
  }

  eliminarVenta(v: Venta): void {
    if (!confirm(`¿Eliminar la venta #${v.id} (${resumenProductosVenta(v.items)})? Esto restaura el stock y no se puede deshacer.`)) {
      return;
    }
    this.ventasService.eliminar(v.id).subscribe({
      next: () => {
        this.cargarVentas();
        this.productosService.listar().subscribe((data) => this.productos.set(data));
      },
      error: (err) => this.error.set(extractError(err)),
    });
  }

  puedeEditarVenta(v: Venta): boolean {
    return this.auth.esManagerOAdmin() && v.comisionEstado !== 'liquidada' && !v.cuotas.some((c) => c.estado === 'pagada');
  }

  puedeEliminarVenta(v: Venta): boolean {
    return this.auth.esAdmin() && v.comisionEstado !== 'liquidada' && !v.cuotas.some((c) => c.estado === 'pagada');
  }

  editarVenta(v: Venta): void {
    this.editandoVentaId.set(v.id);
    this.formEdicion = {
      lineas: v.items.map((item) => ({
        id: item.id,
        codigoProducto: item.codigoProducto,
        cantidad: item.cantidad,
        valorUnitario: Number(item.valorUnitario),
      })),
      compradorCelular: v.compradorCelular ?? '',
      medioPago: v.medioPago,
      numCuotas: v.numCuotas ?? 1,
      frecuenciaCuotas: v.frecuenciaCuotas ?? 'mensual',
      recargoCuotas: v.recargoCuotas !== null ? Number(v.recargoCuotas) : 0,
      canal: v.canal,
      vendedorId: v.vendedorId,
    };
    this.error.set(null);
    this.exito.set(null);
  }

  cancelarEdicionVenta(): void {
    this.editandoVentaId.set(null);
  }

  guardarEdicionVenta(): void {
    const id = this.editandoVentaId();
    if (!id) return;
    this.error.set(null);
    this.exito.set(null);

    const items: LineaVentaEdicionInput[] = [];
    for (const [i, l] of this.formEdicion.lineas.entries()) {
      if (!l.codigoProducto || !l.cantidad || l.valorUnitario === null) {
        this.error.set(`Linea ${i + 1}: producto, cantidad y valor son obligatorios`);
        return;
      }
      items.push({ id: l.id, codigoProducto: l.codigoProducto, cantidad: l.cantidad, valorUnitario: l.valorUnitario });
    }
    if (this.formEdicion.medioPago === 'cuotas' && (!this.formEdicion.numCuotas || this.formEdicion.recargoCuotas === null)) {
      this.error.set('num_cuotas y el recargo son obligatorios para ventas a cuotas');
      return;
    }

    this.guardandoEdicion.set(true);
    this.ventasService
      .actualizar(id, {
        items,
        compradorCelular: this.formEdicion.compradorCelular || undefined,
        medioPago: this.formEdicion.medioPago,
        numCuotas: this.formEdicion.medioPago === 'cuotas' ? this.formEdicion.numCuotas : undefined,
        frecuenciaCuotas: this.formEdicion.medioPago === 'cuotas' ? this.formEdicion.frecuenciaCuotas : undefined,
        recargoCuotas: this.formEdicion.medioPago === 'cuotas' ? (this.formEdicion.recargoCuotas ?? 0) : undefined,
        canal: this.formEdicion.canal,
        vendedorId: this.formEdicion.vendedorId ?? undefined,
      })
      .subscribe({
        next: () => {
          this.exito.set(`Venta #${id} actualizada`);
          this.guardandoEdicion.set(false);
          this.editandoVentaId.set(null);
          this.cargarVentas();
          this.productosService.listar().subscribe((data) => this.productos.set(data));
        },
        error: (err) => {
          this.error.set(extractError(err));
          this.guardandoEdicion.set(false);
        },
      });
  }
}
