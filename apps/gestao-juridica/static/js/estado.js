// Estado compartilhado entre telas: usuário logado e cadastros usados em seletores.
import { get } from './api.js';

export const estado = { eu: null, usuarios: [], clientes: null };

export const EDITA = () => ['admin', 'advogado', 'estagiario'].includes(estado.eu?.papel);
export const ADVOGA = () => ['admin', 'advogado'].includes(estado.eu?.papel);
export const ADMIN = () => estado.eu?.papel === 'admin';

export async function carregarUsuarios(forcar = false) {
  if (forcar || !estado.usuarios.length) estado.usuarios = await get('/api/usuarios');
  return estado.usuarios;
}
export async function carregarClientes() {
  estado.clientes = await get('/api/clientes?limite=500');
  return estado.clientes;
}
