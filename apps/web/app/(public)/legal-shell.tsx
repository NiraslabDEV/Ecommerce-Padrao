import Link from 'next/link';
import { brand } from '@brand';

// Casca partilhada das páginas legais (Termos/Privacidade/Trocas). Whitelabel via var(--st-*);
// o texto é um ponto de partida genérico — cada cliente deve rever com o seu próprio jurídico
// (nome/NUIT da empresa, prazos reais de troca, morada de devolução).
export default function LegalShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-screen max-w-[480px] px-5 pb-16 pt-6" style={{ background: 'var(--st-bg)', color: 'var(--st-text)' }}>
      <Link href="/menu" className="mb-6 inline-block text-sm" style={{ color: 'var(--st-muted-2)' }}>
        ← Voltar à loja
      </Link>
      <h1 className="mb-5 text-2xl font-bold" style={{ fontFamily: 'var(--font-store)' }}>
        {title}
      </h1>
      <div className="space-y-4 text-sm leading-relaxed" style={{ color: 'var(--st-muted-2)' }}>
        {children}
      </div>
      <p className="mt-10 text-xs" style={{ color: 'var(--st-muted)' }}>
        {brand.name} · Última atualização: {new Date().toLocaleDateString('pt-MZ')}
      </p>
    </div>
  );
}
