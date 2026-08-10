import { Routes } from '@angular/router';
import { CatalogoPublicoComponent } from './catalogo-publico/catalogo-publico.component';
import { ComisionesComponent } from './comisiones/comisiones.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { ProductosComponent } from './productos/productos.component';
import { ComprasComponent } from './compras/compras.component';
import { CompraLoteComponent } from './compra-lote/compra-lote.component';
import { CompradoresComponent } from './compradores/compradores.component';
import { VentasComponent } from './ventas/ventas.component';
import { WhatsappComponent } from './whatsapp/whatsapp.component';
import { LoginComponent } from './login/login.component';
import { CambiarPasswordComponent } from './cambiar-password/cambiar-password.component';
import { UsuariosComponent } from './usuarios/usuarios.component';
import { authGuard, soloAutenticadoGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';
import { managerGuard } from './guards/manager.guard';

export const routes: Routes = [
  { path: '', component: CatalogoPublicoComponent },
  { path: 'login', component: LoginComponent },
  { path: 'cambiar-password', component: CambiarPasswordComponent, canActivate: [soloAutenticadoGuard] },
  { path: 'dashboard', component: DashboardComponent, canActivate: [managerGuard] },
  { path: 'productos', component: ProductosComponent, canActivate: [authGuard] },
  { path: 'compras', component: ComprasComponent, canActivate: [authGuard] },
  { path: 'compras/lote', component: CompraLoteComponent, canActivate: [authGuard] },
  { path: 'comisiones', component: ComisionesComponent, canActivate: [managerGuard] },
  { path: 'compradores', component: CompradoresComponent, canActivate: [authGuard] },
  { path: 'ventas', component: VentasComponent, canActivate: [authGuard] },
  { path: 'whatsapp', component: WhatsappComponent, canActivate: [authGuard] },
  { path: 'usuarios', component: UsuariosComponent, canActivate: [adminGuard] },
];
