import { describe, expect, it } from 'vitest';
import { formatCountdown } from '@/hooks/useCountdown';
import { formatCents } from './currency';
import { tenantIcon, tenantInitial } from './favicon';
import { birthDateBrToIso, maskBirthDateInput, maskCpfInput, maskPhoneInput } from './masks';

describe('máscaras', () => {
  it('telefone: celular, fixo e digitação parcial', () => {
    expect(maskPhoneInput('11912345678')).toBe('(11) 91234-5678');
    expect(maskPhoneInput('1133334444')).toBe('(11) 3333-4444');
    expect(maskPhoneInput('119')).toBe('(11) 9');
    expect(maskPhoneInput('')).toBe('');
    expect(maskPhoneInput('(11) 91234-5678 999')).toBe('(11) 91234-5678');
  });

  it('CPF e data limitam dígitos e formatam progressivamente', () => {
    expect(maskCpfInput('529')).toBe('529');
    expect(maskCpfInput('5299822')).toBe('529.982.2');
    expect(maskCpfInput('52998224725999')).toBe('529.982.247-25');
    expect(maskBirthDateInput('170')).toBe('17/0');
    expect(maskBirthDateInput('17051990123')).toBe('17/05/1990');
  });

  it('data BR -> ISO só com data completa', () => {
    expect(birthDateBrToIso('17/05/1990')).toBe('1990-05-17');
    expect(birthDateBrToIso('17/05/19')).toBe('');
  });
});

describe('moeda', () => {
  it('formata centavos com separador de milhar', () => {
    expect(formatCents(0)).toBe('0,00');
    expect(formatCents(5)).toBe('0,05');
    expect(formatCents(123456)).toBe('1.234,56');
    expect(formatCents(100000000)).toBe('1.000.000,00');
  });
});

describe('contador', () => {
  it('formata HH:MM:SS e não fica negativo', () => {
    expect(formatCountdown(0)).toBe('00:00:00');
    expect(formatCountdown(((1 * 60 + 25) * 60 + 10) * 1000)).toBe('01:25:10');
    expect(formatCountdown(-5000)).toBe('00:00:00');
  });
});

describe('ícone da banca', () => {
  it('usa o logo quando existe; senão, SVG com a inicial na cor da banca', () => {
    expect(tenantIcon({ name: 'Trevo', logoUrl: '/logo.svg', primaryColor: '#DF2120' })).toBe('/logo.svg');
    const icon = decodeURIComponent(tenantIcon({ name: 'Banca Aurora', logoUrl: null, primaryColor: '#B4235A' }));
    expect(icon).toContain('fill="#B4235A"');
    expect(icon).toContain('>A</text>');
    expect(tenantInitial('Banca Boreal')).toBe('B');
    expect(tenantInitial('<script>')).toBe('<');
    expect(decodeURIComponent(tenantIcon({ name: '<x>', logoUrl: null, primaryColor: '#000000' }))).not.toContain('<x');
  });
});
