import { Component, OnInit, computed, signal } from '@angular/core';
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
  categorias: Categoria[] = ['arete', 'anillo', 'manilla', 'collar', 'otro'];

  productos = signal<ProductoPublico[]>([]);
  cargando = signal(true);
  categoriaActiva = signal<Categoria | 'todas'>('todas');

  filtrados = computed(() => {
    const activa = this.categoriaActiva();
    const lista = this.productos();
    return activa === 'todas' ? lista : lista.filter((p) => p.categoria === activa);
  });

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
}
