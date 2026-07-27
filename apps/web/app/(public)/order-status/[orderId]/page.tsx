'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { formatMT, type Cents } from '@delivery/core';
import { brand } from '@brand';
import { trackPurchase, type TrackItem } from '@/lib/analytics/track';
import { shouldFirePurchase, markPurchaseFired } from '@/lib/analytics/purchase-guard';

const CARD = 'rounded-2xl p-4 bg-[var(--st-card)] border border-[var(--st-line)]';
const mt = (cents: number) => formatMT(cents as Cents);

type OrderItem = {
  menu_item_id: string;
  name_snapshot: string;
  variant_name_snapshot?: string | null;
  addons?: { id: string; name: string; price_cents: number }[];
  qty: number;
  unit_price_cents: number;
};

export default function OrderStatusPage({ params }: { params: { orderId: string } }) {
  const router = useRouter();
  const [polling, setPolling] = useState(true);

  const { data: orderStatus, isLoading, error } = useQuery({
    queryKey: ['order-status', params.orderId],
    queryFn: async () => {
      const response = await fetch(`/api/order-status/${params.orderId}`);
      if (!response.ok) throw new Error('Failed to fetch order status');
      return response.json();
    },
    enabled: !!params.orderId,
    refetchInterval: polling ? 5000 : false, // Poll every 5 seconds
  });

  useEffect(() => {
    if (orderStatus?.status === 'delivered' || orderStatus?.status === 'cancelled') {
      setPolling(false);
    }
  }, [orderStatus?.status]);

  // purchase — REGRA CRÍTICA (16.1): só em paid/approved, com guard duplo
  // (useRef in-memory + localStorage) para nunca re-disparar em reload/polling.
  const purchaseFiredRef = useRef(false);
  useEffect(() => {
    if (purchaseFiredRef.current || typeof window === 'undefined' || !orderStatus) return;
    if (!shouldFirePurchase(orderStatus.status, params.orderId, window.localStorage)) return;

    purchaseFiredRef.current = true;
    markPurchaseFired(params.orderId, window.localStorage);

    const items: TrackItem[] = (orderStatus.order_items ?? []).map((oi: any) => ({
      id: oi.menu_item_id,
      name: oi.name_snapshot,
      price_cents: oi.unit_price_cents,
      qty: oi.qty,
    }));

    trackPurchase({ orderId: params.orderId, totalCents: orderStatus.total_cents, items });
  }, [orderStatus, params.orderId]);

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      awaiting_approval: '#b7791f',
      approved: '#16a34a',
      awaiting_payment: '#b7791f',
      paid: '#16a34a',
      payment_failed: '#dc2626',
      in_preparation: '#2563eb',
      ready: '#7c3aed',
      delivered: '#16a34a',
      cancelled: '#dc2626',
    };
    return colors[status] || 'var(--st-muted)';
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      awaiting_approval: 'A confirmar pagamento',
      approved: 'Pagamento confirmado',
      awaiting_payment: 'Aguardando pagamento',
      paid: 'Pagamento confirmado',
      payment_failed: 'Pagamento falhou',
      in_preparation: 'Em preparação',
      ready: 'Pronto',
      delivered: 'Entregue',
      cancelled: 'Cancelado',
    };
    return labels[status] || status;
  };

  const getPaymentLabel = (method?: string) => {
    const labels: Record<string, string> = {
      mpesa: 'M-Pesa',
      emola: 'e-Mola',
      credit_card: 'Cartão de crédito',
      cash: 'Dinheiro na entrega',
    };
    return method ? (labels[method] ?? method) : '—';
  };

  // repõe o carrinho a partir dos itens do pedido e volta à loja
  const reorder = () => {
    const items = (orderStatus?.order_items ?? []).map((oi: any) => ({ menuItemId: oi.menu_item_id, qty: oi.qty }));
    if (items.length) localStorage.setItem('cart', JSON.stringify(items));
    router.push('/menu');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--st-bg)]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--st-primary)] mx-auto mb-4"></div>
          <p className="text-[var(--st-muted)]">A carregar o estado do pedido…</p>
        </div>
      </div>
    );
  }

  if (error || !orderStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--st-bg)]">
        <div className="text-center">
          <p className="mb-3" style={{ color: error ? '#dc2626' : 'var(--st-muted)' }}>
            {error ? 'Erro ao carregar o estado do pedido' : 'Pedido não encontrado'}
          </p>
          <button onClick={() => router.push('/menu')} className="underline" style={{ color: 'var(--st-primary-2)' }}>Voltar à loja</button>
        </div>
      </div>
    );
  }

  const isTerminal = ['delivered', 'cancelled'].includes(orderStatus.status);
  const isCancelled = orderStatus.status === 'cancelled';
  const items: OrderItem[] = orderStatus.order_items ?? [];

  return (
    <div className="min-h-screen bg-[var(--st-bg)]">
      <div className="max-w-[480px] md:max-w-2xl mx-auto pb-8">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-[var(--st-bg)]/95 backdrop-blur border-b border-[var(--st-line)]">
          <div className="px-4 md:px-8 py-4 flex items-center gap-3">
            <button onClick={() => router.push('/menu')} className="text-2xl text-[var(--st-text)] leading-none" aria-label="Voltar">←</button>
            <h1 className="text-xl font-extrabold text-[var(--st-text)]">Acompanhar pedido</h1>
          </div>
        </header>

        <div className="px-4 md:px-8 mt-4 space-y-4">
          {/* Pedido + estado */}
          <div className={CARD}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[var(--st-muted)] text-sm mb-1">Pedido</p>
                <p className="text-[var(--st-text)] font-extrabold text-xl">{orderStatus.order_number}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: getStatusColor(orderStatus.status) }}>
                <span className={`w-2 h-2 rounded-full bg-current ${!isTerminal ? 'animate-pulse' : ''}`} />
                {getStatusLabel(orderStatus.status)}
              </span>
            </div>

            {/* Tracker */}
            {!isCancelled && (
              <div className="mt-6">
                <Tracker status={orderStatus.status} fulfillment={orderStatus.fulfillment_type} />
              </div>
            )}
          </div>

          {/* Cancelado */}
          {isCancelled && (
            <div className="rounded-2xl p-4" style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)' }}>
              <p className="text-sm text-center" style={{ color: '#dc2626' }}>Pedido cancelado. Contacte a {brand.name} para mais informações.</p>
            </div>
          )}

          {/* A confirmar pagamento */}
          {orderStatus.status === 'awaiting_approval' && (
            <div className="rounded-2xl p-4" style={{ background: 'rgba(183,121,31,0.08)', border: '1px solid rgba(183,121,31,0.25)' }}>
              <p className="text-sm text-center" style={{ color: '#b7791f' }}>Pedido recebido! A confirmar o seu pagamento.</p>
            </div>
          )}

          {/* Itens do pedido */}
          {items.length > 0 && (
            <div className={CARD}>
              <h2 className="text-[var(--st-text)] font-bold mb-3">Itens do pedido</h2>
              <div className="space-y-3">
                {items.map((it, idx) => {
                  const detail = [it.variant_name_snapshot, ...(it.addons ?? []).map((a) => a.name)].filter(Boolean).join(' · ');
                  return (
                    <div key={idx} className="flex justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="text-[var(--st-text)] font-medium">{it.qty}× {it.name_snapshot}</p>
                        {detail && <p className="text-[12px] mt-0.5" style={{ color: 'var(--st-muted)' }}>{detail}</p>}
                      </div>
                      <span className="text-[var(--st-text)] shrink-0 font-medium">{mt(it.unit_price_cents * it.qty)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Detalhes */}
          <div className={CARD}>
            <h2 className="text-[var(--st-text)] font-bold mb-4">Detalhes</h2>
            <div className="space-y-3 text-sm">
              <Row label="Entrega">{orderStatus.fulfillment_type === 'delivery' ? 'Entrega' : 'Levantamento na loja'}</Row>
              <Row label="Pagamento">{getPaymentLabel(orderStatus.payment_method)}</Row>
              {orderStatus.scheduled_for && (
                <Row label="Agendado para">{new Date(orderStatus.scheduled_for).toLocaleString('pt-MZ', { dateStyle: 'short', timeStyle: 'short' })}</Row>
              )}
              <Row label="Data do pedido">{new Date(orderStatus.created_at).toLocaleString('pt-MZ', { dateStyle: 'short', timeStyle: 'short' })}</Row>
              <div className="flex justify-between pt-2 border-t border-[var(--st-line)]">
                <span className="text-[var(--st-muted)]">Total</span>
                <span className="text-[var(--st-text)] font-extrabold text-base">{mt(orderStatus.total_cents)}</span>
              </div>
            </div>
          </div>

          {/* Atualização */}
          {!isTerminal && (
            <button
              onClick={() => setPolling(!polling)}
              className="w-full rounded-2xl py-3.5 px-4 font-semibold transition-colors"
              style={{ background: 'var(--st-card)', border: '1px solid var(--st-line)', color: 'var(--st-muted-2)' }}
            >
              {polling ? '⏸ Pausar atualização automática' : '▶ Retomar atualização'}
            </button>
          )}

          {/* Terminal: feedback + ações */}
          {isTerminal && (
            <>
              {orderStatus.status === 'delivered' && !orderStatus.feedback_submitted && (
                <div className={CARD}>
                  <h2 className="text-[var(--st-text)] font-bold mb-3">O que achou da sua compra?</h2>
                  <FeedbackForm orderId={params.orderId} />
                </div>
              )}
              <button onClick={reorder} className="w-full text-white font-extrabold py-4 px-4 rounded-2xl" style={{ background: 'var(--st-grad)' }}>
                ↻ Comprar novamente
              </button>
              <button onClick={() => router.push('/menu')} className="w-full rounded-2xl py-3.5 px-4 font-semibold" style={{ background: 'var(--st-card)', border: '1px solid var(--st-line)', color: 'var(--st-muted-2)' }}>
                Voltar à loja
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--st-muted)]">{label}</span>
      <span className="text-[var(--st-text)] text-right">{children}</span>
    </div>
  );
}

// Tracker horizontal: Recebido → Confirmado → A caminho/Pronto p/ retirada → Entregue
function Tracker({ status, fulfillment }: { status: string; fulfillment: string }) {
  const nodes = ['Recebido', 'Confirmado', fulfillment === 'delivery' ? 'A caminho' : 'Pronto p/ retirada', 'Entregue'];
  const stepOf = (s: string) => {
    if (['approved', 'paid', 'in_preparation'].includes(s)) return 1;
    if (s === 'ready') return 2;
    if (s === 'delivered') return 3;
    return 0; // awaiting_* / payment_failed
  };
  const active = stepOf(status);

  return (
    <div className="flex items-start">
      {nodes.map((label, i) => {
        const done = i < active;
        const isActive = i === active;
        const reached = done || isActive;
        return (
          <div key={i} className="flex-1 flex flex-col items-center relative">
            {i > 0 && (
              <div
                className="absolute top-[10px] right-1/2 w-full h-[2px]"
                style={{ background: i <= active ? 'var(--st-primary)' : 'var(--st-line)' }}
              />
            )}
            <div
              className="w-[22px] h-[22px] rounded-full grid place-items-center text-[10px] font-extrabold text-white relative z-[1] mb-1.5"
              style={{ background: reached ? 'var(--st-primary)' : 'transparent', border: `2px solid ${reached ? 'var(--st-primary)' : 'var(--st-line)'}` }}
            >
              {done ? '✓' : isActive ? '•' : ''}
            </div>
            <span
              className="text-[9.5px] text-center leading-tight"
              style={{ color: isActive ? 'var(--st-primary)' : done ? 'var(--st-muted)' : 'var(--st-muted)', opacity: isActive || done ? 1 : 0.5, fontWeight: isActive ? 800 : 400 }}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Feedback
function FeedbackForm({ orderId }: { orderId: string }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) { setError('Por favor, selecione uma classificação'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, rating, comment }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Erro ao enviar feedback');
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar feedback');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="text-center py-4">
        <p className="text-lg font-semibold" style={{ color: 'var(--st-primary)' }}>Obrigado pelo seu feedback!</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex justify-center gap-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button key={star} type="button" onClick={() => setRating(star)} className="text-3xl transition-colors" style={{ color: star <= rating ? 'var(--st-star)' : 'var(--st-line)' }}>
            {star <= rating ? '★' : '☆'}
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Comentário opcional…"
        className="w-full rounded-xl p-3 text-[var(--st-text)] placeholder:text-[var(--st-muted)] focus:outline-none focus:border-[var(--st-primary)] border border-[var(--st-line)] bg-[var(--st-bg)]"
        rows={3}
      />
      {error && <p className="text-sm text-center" style={{ color: '#dc2626' }}>{error}</p>}
      <button type="submit" disabled={submitting || rating === 0} className="w-full text-white font-bold py-3 px-4 rounded-2xl disabled:opacity-50" style={{ background: 'var(--st-grad)' }}>
        {submitting ? 'A enviar…' : 'Enviar feedback'}
      </button>
    </form>
  );
}
