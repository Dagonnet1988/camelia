import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Producto } from '../../models/domain.models';

/** Selector de producto con filtro por nombre o codigo mientras se escribe, en vez de un
 * <select> nativo con todos los productos listados. Uso: [(codigo)]="form.codigoProducto"
 * (dos vias), y opcionalmente (codigoChange) si el padre necesita reaccionar a la seleccion. */
@Component({
  selector: 'app-producto-selector',
  imports: [FormsModule],
  templateUrl: './producto-selector.component.html',
  styleUrl: './producto-selector.component.scss',
})
export class ProductoSelectorComponent implements OnChanges {
  @Input({ required: true }) productos: Producto[] = [];
  @Input() codigo = '';
  @Input() placeholder = 'Nombre o codigo del producto…';
  @Output() codigoChange = new EventEmitter<string>();

  texto = '';
  abierto = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['codigo'] || changes['productos']) {
      this.sincronizarTexto();
    }
  }

  private sincronizarTexto(): void {
    const p = this.productos.find((p) => p.codigo === this.codigo);
    this.texto = p ? this.etiqueta(p) : '';
  }

  etiqueta(p: Producto): string {
    return `${p.nombre} (${p.codigo})`;
  }

  get resultados(): Producto[] {
    const q = this.texto.trim().toLowerCase();
    const seleccionado = this.productos.find((p) => p.codigo === this.codigo);
    // Si el texto ya coincide con el producto seleccionado (recien abierto, sin escribir nada
    // nuevo), mostrar la lista completa en vez de filtrarla a un solo resultado.
    if (!q || (seleccionado && this.etiqueta(seleccionado).toLowerCase() === q)) {
      return this.productos;
    }
    return this.productos.filter((p) => p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q));
  }

  onFocus(): void {
    this.abierto = true;
  }

  onInput(valor: string): void {
    this.texto = valor;
    this.abierto = true;
  }

  seleccionar(p: Producto): void {
    this.codigo = p.codigo;
    this.texto = this.etiqueta(p);
    this.abierto = false;
    this.codigoChange.emit(p.codigo);
  }

  onBlur(): void {
    // Si el usuario no eligio un resultado de la lista, se descarta lo escrito y se vuelve al
    // producto seleccionado (o queda vacio) - el valor real (codigo) solo cambia al hacer clic.
    this.abierto = false;
    this.sincronizarTexto();
  }
}
