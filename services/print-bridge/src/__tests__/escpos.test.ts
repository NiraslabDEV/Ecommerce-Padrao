import { describe, it, expect } from 'vitest';
import { createReceipt, decodeReceipt, CUT_FULL } from '../escpos';
import type { PrintJobPayload } from '../types';

const baseJob: PrintJobPayload = {
  order_number: 'ENC-0001',
  customer_name: 'João Silva',
  fulfillment_type: 'pickup',
  items: [{ name: 'Frango Grelhado', quantity: 2 }],
  payment_method: 'mpesa',
  payment_status: 'paid',
  total_cents: 45000,
  created_at: new Date().toISOString(),
};

describe('createReceipt()', () => {
  it('retorna Buffer com bytes ESC/POS', () => {
    const buf = createReceipt(baseJob);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });

  it('contém o número do pedido', () => {
    const buf = createReceipt(baseJob);
    const text = decodeReceipt(buf);
    expect(text).toContain('ENC-0001');
  });

  it('contém o nome do cliente', () => {
    const buf = createReceipt(baseJob);
    const text = decodeReceipt(buf);
    expect(text.toUpperCase()).toContain('JOÃO');
  });

  it('contém LEVANTAMENTO para pickup', () => {
    const buf = createReceipt(baseJob);
    const text = decodeReceipt(buf);
    expect(text).toContain('LEVANTAMENTO');
  });

  it('contém ENTREGA e zona para delivery', () => {
    const job: PrintJobPayload = {
      ...baseJob,
      fulfillment_type: 'delivery',
      delivery_zone: 'Polana',
      address: 'Av. Julius Nyerere, 123',
    };
    const text = decodeReceipt(createReceipt(job));
    expect(text).toContain('ENTREGA');
    expect(text).toContain('Polana');
  });

  it('termina com bytes de corte total', () => {
    const buf = createReceipt(baseJob);
    const cutBytes = Array.from(CUT_FULL);
    const end = Array.from(buf.subarray(-cutBytes.length));
    expect(end).toEqual(cutBytes);
  });

  it('teste de impressão', () => {
    const buf = createReceipt({ test: true, message: 'Olá mundo' });
    const text = decodeReceipt(buf);
    expect(text).toContain('Olá mundo');
  });
});
