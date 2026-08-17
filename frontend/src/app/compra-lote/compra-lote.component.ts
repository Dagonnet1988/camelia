import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { Categoria, LineaCompraLoteInput, Producto } from '../models/domain.models';
import { ComprasService } from '../services/compras.service';
import { ProductosService } from '../services/productos.service';
import { extractError } from '../shared/http-error';
import { ProductoSelectorComponent } from '../shared/producto-selector/producto-selector.component';

interface LineaLote {
  esNuevo: boolean;
  codigoProducto: string;
  cantidad: number | null;
  valorCompraUnitario: number | null;
  productoNuevo: {
    codigo: string;
    nombre: string;
    categoria: Categoria;
    valorVenta: number | null;
    stockMinimo: number | null;
  };
}

function lineaVacia(): LineaLote {
  return {
    esNuevo: false,
    codigoProducto: '',
    cantidad: null,
    valorCompraUnitario: null,
    productoNuevo: { codigo: '', nombre: '', categoria: '', valorVenta: null, stockMinimo: 0 },
  };
}

@Component({
  selector: 'app-compra-lote',
  imports: [FormsModule, RouterLink, ProductoSelectorComponent],
  templateUrl: './compra-lote.component.html',
  styleUrl: './compra-lote.component.scss',
})
export class CompraLoteComponent implements OnInit {
  productos = signal<Producto[]>([]);
  error = signal<string | null>(null);
  exito = signal<string | null>(null);
  guardando = signal(false);

  categoriasSugeridas = computed(() => {
    const set = new Set(this.productos().map((p) => p.categoria).filter(Boolean));
    return Array.from(set).sort();
  });

  proveedor = '';
  fechaCompra = '';
  lineas: LineaLote[] = [lineaVacia()];

  constructor(
    private comprasService: ComprasService,
    private productosService: ProductosService,
  ) {}

  ngOnInit(): void {
    this.productosService.listar().subscribe((data) => this.productos.set(data));
  }

  agregarLinea(): void {
    this.lineas.push(lineaVacia());
  }

  quitarLinea(index: number): void {
    if (this.lineas.length === 1) return;
    this.lineas.splice(index, 1);
  }

  toggleNuevo(linea: LineaLote): void {
    linea.esNuevo = !linea.esNuevo;
    linea.codigoProducto = '';
    linea.productoNuevo = { codigo: '', nombre: '', categoria: '', valorVenta: null, stockMinimo: 0 };
  }

  guardar(): void {
    this.error.set(null);
    this.exito.set(null);

    const lineas: LineaCompraLoteInput[] = [];
    for (const [i, l] of this.lineas.entries()) {
      const codigoProducto = l.esNuevo ? l.productoNuevo.codigo : l.codigoProducto;
      if (!codigoProducto || !l.cantidad || !l.valorCompraUnitario) {
        this.error.set(`Linea ${i + 1}: producto, cantidad y valor de compra son obligatorios`);
        return;
      }
      if (l.esNuevo && (!l.productoNuevo.nombre || l.productoNuevo.valorVenta === null)) {
        this.error.set(`Linea ${i + 1}: nombre y valor de venta del producto nuevo son obligatorios`);
        return;
      }
      lineas.push({
        codigoProducto,
        cantidad: l.cantidad,
        valorCompraUnitario: l.valorCompraUnitario,
        productoNuevo: l.esNuevo
          ? {
              nombre: l.productoNuevo.nombre,
              categoria: l.productoNuevo.categoria,
              valorVenta: l.productoNuevo.valorVenta as number,
              stockMinimo: l.productoNuevo.stockMinimo ?? 0,
            }
          : undefined,
      });
    }

    this.guardando.set(true);
    this.comprasService
      .registrarLote({
        proveedor: this.proveedor || undefined,
        fechaCompra: this.fechaCompra || undefined,
        lineas,
      })
      .subscribe({
        next: (compras) => {
          this.guardando.set(false);
          this.exito.set(`${compras.length} compra${compras.length === 1 ? '' : 's'} registrada${compras.length === 1 ? '' : 's'}`);
          this.proveedor = '';
          this.fechaCompra = '';
          this.lineas = [lineaVacia()];
          this.productosService.listar().subscribe((data) => this.productos.set(data));
        },
        error: (err) => {
          this.error.set(extractError(err));
          this.guardando.set(false);
        },
      });
  }
}
