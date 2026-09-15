import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
/** Marca uma rota como acessível sem sessão (páginas públicas de agendamento). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
