import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Comprador } from '../models/domain.models';
import { CompradoresService } from '../services/compradores.service';
import { extractError } from '../shared/http-error';

@Component({
  selector: 'app-compradores',
  imports: [FormsModule],
  templateUrl: './compradores.component.html',
  styleUrl: './compradores.component.scss',
})
export class CompradoresComponent implements OnInit {
  compradores = signal<Comprador[]>([]);
  error = signal<string | null>(null);
  exito = signal<string | null>(null);
  guardando = signal(false);

  celular = '';
  nombre = '';

  constructor(private compradoresService: CompradoresService) {}

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.compradoresService.listar().subscribe((data) => this.compradores.set(data));
  }

  crear(): void {
    this.error.set(null);
    this.exito.set(null);

    if (!this.celular || !this.nombre) {
      this.error.set('Celular y nombre son obligatorios');
      return;
    }

    this.guardando.set(true);
    this.compradoresService.crear({ celular: this.celular, nombre: this.nombre }).subscribe({
      next: () => {
        this.exito.set('Comprador creado');
        this.guardando.set(false);
        this.celular = '';
        this.nombre = '';
        this.cargar();
      },
      error: (err) => {
        this.error.set(extractError(err));
        this.guardando.set(false);
      },
    });
  }
}
