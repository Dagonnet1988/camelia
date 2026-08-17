import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type {
  Canal,
  Comprador,
  CuotaConVenta,
  FrecuenciaCuotas,
  MedioPago,
  Producto,
  Vendedor,
  Venta,
} from '../models/domain.models';
import { AuthService } from '../services/auth.service';
import { ComisionesService } from '../services/comisiones.service';
import { CompradoresService } from '../services/compradores.service';
import { CuotasService } from '../services/cuotas.service';
import { ProductosService } from '../services/productos.service';
import { VentasService } from '../services/ventas.service';
import { extractError } from '../shared/http-error';
import { ProductoSelectorComponent } from '../shared/producto-selector/producto-selector.component';

interface VentaForm {
  codigoProducto: string;
  compradorCelular: string;
  cantidad: number | null;
  valorContado: number | null;
  medioPago: MedioPago;
  numCuotas: number;
  frecuenciaCuotas: FrecuenciaCuotas;
  canal: Canal;
  vendedorId: number | null;
}

interface CompradorNuevoForm {
  celular: string;
  nombre: string;
}

interface EdicionVentaForm {
  compradorCelular: string;
  cantidad: number | null;
  valorContado: number | null;
  medioPago: MedioPago;
  numCuotas: number;
  frecuenciaCuotas: FrecuenciaCuotas;
  recargoCuotas: number | null;
  canal: Canal;
  vendedorId: number | null;
}

const FORM_VACIO: VentaForm = {
  codigoProducto: '',
  compradorCelular: '',
  cantidad: null,
  valorContado: null,
  medioPago: 'contado',
  numCuotas: 1,
  frecuenciaCuotas: 'mensual',
  canal: 'whatsapp',
  vendedorId: null,
};

const COMPRADOR_NUEVO_VACIO: CompradorNuevoForm = {
  celular: '',
  nombre: '',
};

@Component({
  selector: 'app-ventas',
  imports: [FormsModule, DatePipe, ProductoSelectorComponent],
  templateUrl: './ventas.component.html',
  styleUrl: './ventas.component.scss',
})
export class VentasComponent implements OnInit {
  productos = signal<Producto[]>([]);
  compradores = signal<Comprador[]>([]);
  ventas = signal<Venta[]>([]);
  cuotasPendientes = signal<CuotaConVenta[]>([]);
  error = signal<string | null>(null);
  exito = signal<string | null>(null);
  guardando = signal(false);
  pagandoCuotaId = signal<number | null>(null);

  vendedores = signal<Vendedor[]>([]);
  filtroVendedorId: number | null = null;

  esCompradorNuevo = signal(false);

  editandoVentaId = signal<number | null>(null);
  guardandoEdicion = signal(false);
  formEdicion: EdicionVentaForm = {
    compradorCelular: '',
    cantidad: null,
    valorContado: null,
    medioPago: 'contado',
    numCuotas: 1,
    frecuenciaCuotas: 'mensual',
    recargoCuotas: null,
    canal: 'whatsapp',
    vendedorId: null,
  };

  form: VentaForm = { ...FORM_VACIO };
  compradorNuevo: CompradorNuevoForm = { ...COMPRADOR_NUEVO_VACIO };

  constructor(
    private ventasService: VentasService,
    private productosService: ProductosService,
    private compradoresService: CompradoresService,
    private cuotasService: CuotasService,
    private comisionesService: ComisionesService,
    protected auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.productosService.listar().subscribe((data) => this.productos.set(data));
    this.compradoresService.listar().subscribe((data) => this.compradores.set(data));
    this.cargarVentas();
    this.cargarCuotasPendientes();
    if (this.auth.esManagerOAdmin()) {
      this.comisionesService.vendedores().subscribe((data) => this.vendedores.set(data));
      // Por defecto la venta queda a nombre de quien la registra; manager/admin puede cambiarlo.
      this.form.vendedorId = this.auth.usuario()?.id ?? null;
    }
  }

  cargarVentas(): void {
    this.ventasService.listar(this.filtroVendedorId ?? undefined).subscribe((data) => this.ventas.set(data));
  }

  onFiltroVendedorChange(): void {
    this.cargarVentas();
  }

  cargarCuotasPendientes(): void {
    this.cuotasService.listar().subscribe((data) => {
      // Solo se muestra la proxima cuota sin pagar de cada venta (no todas a la vez) - una
      // vez marcada pagada, la siguiente aparece sola. La lista ya viene ordenada por
      // fecha_vencimiento asc, asi que la primera cuota de cada venta que aparece es la mas
      // proxima.
      const noPagadas = data.filter((c) => c.estado !== 'pagada');
      const primeraPorVenta = new Map<number, CuotaConVenta>();
      for (const c of noPagadas) {
        if (!primeraPorVenta.has(c.idVenta)) {
          primeraPorVenta.set(c.idVenta, c);
        }
      }
      this.cuotasPendientes.set(Array.from(primeraPorVenta.values()));
    });
  }

  nombreProducto(codigo: string): string {
    return this.productos().find((p) => p.codigo === codigo)?.nombre ?? codigo;
  }

  nombreComprador(celular: string | null): string {
    if (!celular) return 'Anonimo';
    return this.compradores().find((c) => c.celular === celular)?.nombre ?? celular;
  }

  toggleCompradorNuevo(valor: boolean): void {
    this.esCompradorNuevo.set(valor);
    this.form.compradorCelular = '';
    this.compradorNuevo = { ...COMPRADOR_NUEVO_VACIO };
  }

  recalcularValorSugerido(): void {
    const producto = this.productos().find((p) => p.codigo === this.form.codigoProducto);
    if (!producto || !this.form.cantidad) return;
    this.form.valorContado = Number(producto.valorVenta) * this.form.cantidad;
  }

  valorCatalogo(): string | null {
    const producto = this.productos().find((p) => p.codigo === this.form.codigoProducto);
    if (!producto || !this.form.cantidad) return null;
    return String(Number(producto.valorVenta) * this.form.cantidad);
  }

  registrar(): void {
    this.error.set(null);
    this.exito.set(null);

    if (!this.form.codigoProducto || !this.form.cantidad) {
      this.error.set('Producto y cantidad son obligatorios');
      return;
    }
    if (this.form.valorContado === null || this.form.valorContado < 0) {
      this.error.set('El valor a cobrar es obligatorio');
      return;
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
        codigoProducto: this.form.codigoProducto,
        compradorCelular: this.esCompradorNuevo() ? this.compradorNuevo.celular : this.form.compradorCelular || undefined,
        compradorNuevo: this.esCompradorNuevo() ? { nombre: this.compradorNuevo.nombre } : undefined,
        cantidad: this.form.cantidad,
        valorContado: this.form.valorContado,
        medioPago: this.form.medioPago,
        numCuotas: this.form.medioPago === 'cuotas' ? this.form.numCuotas : undefined,
        frecuenciaCuotas: this.form.medioPago === 'cuotas' ? this.form.frecuenciaCuotas : undefined,
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
          this.form = { ...FORM_VACIO, vendedorId: vendedorPrevio };
          this.esCompradorNuevo.set(false);
          this.compradorNuevo = { ...COMPRADOR_NUEVO_VACIO };
          this.cargarVentas();
          this.cargarCuotasPendientes();
          this.productosService.listar().subscribe((data) => this.productos.set(data));
          this.compradoresService.listar().subscribe((data) => this.compradores.set(data));
        },
        error: (err) => {
          this.error.set(extractError(err));
          this.guardando.set(false);
        },
      });
  }

  pagarCuota(cuota: CuotaConVenta): void {
    this.pagandoCuotaId.set(cuota.id);
    this.cuotasService.pagar(cuota.id).subscribe({
      next: () => {
        this.pagandoCuotaId.set(null);
        this.cargarCuotasPendientes();
      },
      error: (err) => {
        this.error.set(extractError(err));
        this.pagandoCuotaId.set(null);
      },
    });
  }

  puedeEditarVenta(v: Venta): boolean {
    return this.auth.esManagerOAdmin() && v.comisionEstado !== 'liquidada' && !v.cuotas.some((c) => c.estado === 'pagada');
  }

  editarVenta(v: Venta): void {
    this.editandoVentaId.set(v.id);
    this.formEdicion = {
      compradorCelular: v.compradorCelular ?? '',
      cantidad: v.cantidad,
      valorContado: Number(v.valorContado),
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

    if (!this.formEdicion.cantidad || this.formEdicion.valorContado === null || this.formEdicion.valorContado < 0) {
      this.error.set('Cantidad y valor a cobrar son obligatorios');
      return;
    }
    if (this.formEdicion.medioPago === 'cuotas' && (!this.formEdicion.numCuotas || this.formEdicion.recargoCuotas === null)) {
      this.error.set('num_cuotas y el recargo son obligatorios para ventas a cuotas');
      return;
    }

    this.guardandoEdicion.set(true);
    this.ventasService
      .actualizar(id, {
        compradorCelular: this.formEdicion.compradorCelular || undefined,
        cantidad: this.formEdicion.cantidad,
        valorContado: this.formEdicion.valorContado,
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
          this.cargarCuotasPendientes();
          this.productosService.listar().subscribe((data) => this.productos.set(data));
        },
        error: (err) => {
          this.error.set(extractError(err));
          this.guardandoEdicion.set(false);
        },
      });
  }
}
