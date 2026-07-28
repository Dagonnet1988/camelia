import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard.component';
import { ProductosComponent } from './productos/productos.component';
import { ComprasComponent } from './compras/compras.component';
import { CompradoresComponent } from './compradores/compradores.component';
import { VentasComponent } from './ventas/ventas.component';

export const routes: Routes = [
  { path: '', component: DashboardComponent },
  { path: 'productos', component: ProductosComponent },
  { path: 'compras', component: ComprasComponent },
  { path: 'compradores', component: CompradoresComponent },
  { path: 'ventas', component: VentasComponent },
];
