import { Controller, Get, Header, Inject, UseGuards } from '@nestjs/common';
import type { HoroscopeTodayResponse } from '@sysjb/contracts';
import { SessionGuard } from '../auth/session.guard.js';
import { TenantGuard } from '../tenancy/tenant.guard.js';
import { HoroscopeService } from './horoscope.service.js';

/** Horóscopo do dia para o jogador logado (Loterias > Horóscopo): só o cache, nunca o provedor. */
@Controller('v1/horoscope')
@UseGuards(TenantGuard, SessionGuard)
export class HoroscopeController {
  constructor(@Inject(HoroscopeService) private readonly horoscope: HoroscopeService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  today(): Promise<HoroscopeTodayResponse> {
    return this.horoscope.today();
  }
}
