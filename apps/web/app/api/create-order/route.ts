import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

function translateError(msg: string): string {
  if (msg.startsWith('out_of_stock:'))   return 'Um ou mais itens do teu pedido estão esgotados. Volta à loja e ajusta a quantidade.';
  if (msg.startsWith('item_unavailable:')) return 'Um item do teu pedido deixou de estar disponível. Volta à loja e remove-o.';
  if (msg.startsWith('invalid_variant:'))  return 'O tamanho escolhido já não está disponível. Volta à loja e escolhe outro.';
  if (msg.startsWith('invalid_addon:'))    return 'Uma das opções escolhidas já não está disponível. Volta à loja e ajusta.';
  if (msg === 'store_closed')             return 'A loja está encerrada de momento.';
  if (msg === 'empty_order')              return 'O carrinho está vazio.';
  if (msg === 'invalid_customer_name')    return 'Nome inválido.';
  if (msg === 'delivery_zone_required')   return 'Seleciona uma zona de entrega.';
  if (msg === 'delivery_address_required') return 'Indica a morada de entrega.';
  if (msg === 'scheduled_for_must_be_future') return 'O horário agendado deve ser no futuro.';
  if (msg === 'scheduled_for_outside_hours')  return 'Horário fora do período de funcionamento.';
  if (msg === 'scheduled_for_invalid_slot')   return 'Horário inválido. Escolhe um dos slots disponíveis.';
  if (msg === 'referral_invalid_or_expired')  return 'Código de referral inválido ou expirado.';
  if (msg === 'referral_auto_redemption')     return 'Não podes usar o teu próprio código de referral.';
  if (msg === 'referral_already_redeemed')    return 'Já usaste este código de referral.';
  if (msg === 'referral_max_redemptions')     return 'Este código de referral já atingiu o limite de utilizações.';
  if (msg === 'gift_item_not_authorized')     return 'Item de brinde não autorizado. Aplica um código válido primeiro.';
  if (msg === 'gift_item_max_one')            return 'Só é permitida 1 unidade do item de brinde.';
  return msg;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const payload = await request.json();

    const { data, error } = await supabase.rpc('create_order', {
      p_payload: payload,
    });

    if (error) {
      console.error('Error creating order:', error);
      return NextResponse.json({ error: translateError(error.message) }, { status: 400 });
    }

    return NextResponse.json({ orderId: data });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Erro interno. Tenta novamente.' }, { status: 500 });
  }
}