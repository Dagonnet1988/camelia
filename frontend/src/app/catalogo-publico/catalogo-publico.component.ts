import { Component, HostListener, OnInit, computed, signal } from '@angular/core';
import type { Categoria, ProductoPublico } from '../models/domain.models';
import { PublicoService } from '../services/publico.service';

const MONEDA = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

@Component({
  selector: 'app-catalogo-publico',
  templateUrl: './catalogo-publico.component.html',
  styleUrl: './catalogo-publico.component.scss',
})
export class CatalogoPublicoComponent implements OnInit {
  productos = signal<ProductoPublico[]>([]);
  cargando = signal(true);
  categoriaActiva = signal<Categoria | 'todas'>('todas');

  // Categoria es texto libre; las categorias del filtro son las que realmente estan en uso
  // entre los productos visibles, no una lista fija.
  categorias = computed(() => {
    const set = new Set(this.productos().map((p) => p.categoria).filter(Boolean));
    return Array.from(set).sort();
  });

  filtrados = computed(() => {
    const activa = this.categoriaActiva();
    const lista = this.productos();
    return activa === 'todas' ? lista : lista.filter((p) => p.categoria === activa);
  });

  private indiceFoto = signal<Record<string, number>>({});

  constructor(private publicoService: PublicoService) {}

  ngOnInit(): void {
    this.publicoService.catalogo().subscribe((data) => {
      this.productos.set(data);
      this.cargando.set(false);
    });
  }

  formatMoneda(valor: string): string {
    return MONEDA.format(Number(valor));
  }

  indiceActivo(codigo: string): number {
    return this.indiceFoto()[codigo] ?? 0;
  }

  onScrollFotos(event: Event, codigo: string): void {
    const el = event.target as HTMLElement;
    const indice = el.clientWidth > 0 ? Math.round(el.scrollLeft / el.clientWidth) : 0;
    this.indiceFoto.update((m) => ({ ...m, [codigo]: indice }));
  }

  irAFoto(carrusel: HTMLElement, indice: number): void {
    carrusel.scrollTo({ left: indice * carrusel.clientWidth, behavior: 'smooth' });
  }

  moverFoto(carrusel: HTMLElement, delta: number, codigo: string, totalFotos: number): void {
    const siguiente = Math.max(0, Math.min(totalFotos - 1, this.indiceActivo(codigo) + delta));
    this.irAFoto(carrusel, siguiente);
  }

  productoLightbox = signal<ProductoPublico | null>(null);
  indiceLightbox = signal(0);

  abrirLightbox(p: ProductoPublico, indiceInicial: number): void {
    this.productoLightbox.set(p);
    this.indiceLightbox.set(indiceInicial);
  }

  cerrarLightbox(): void {
    this.productoLightbox.set(null);
  }

  moverLightbox(delta: number): void {
    const p = this.productoLightbox();
    if (!p) return;
    this.indiceLightbox.update((i) => Math.max(0, Math.min(p.fotos.length - 1, i + delta)));
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!this.productoLightbox()) return;
    if (event.key === 'Escape') this.cerrarLightbox();
    if (event.key === 'ArrowLeft') this.moverLightbox(-1);
    if (event.key === 'ArrowRight') this.moverLightbox(1);
  }
}
