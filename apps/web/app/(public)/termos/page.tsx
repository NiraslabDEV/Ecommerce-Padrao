import type { Metadata } from 'next';
import { brand } from '@brand';
import LegalShell from '../legal-shell';

export const metadata: Metadata = { title: 'Termos e Condições' };

export default function TermosPage() {
  return (
    <LegalShell title="Termos e Condições">
      <p>
        Ao utilizar a loja online da {brand.name} e efetuar uma encomenda, o cliente aceita os termos
        descritos nesta página.
      </p>

      <h2 className="font-semibold" style={{ color: 'var(--st-text)' }}>1. Encomendas</h2>
      <p>
        Toda a encomenda fica sujeita a confirmação de pagamento (comprovativo M-Pesa/e-Mola, verificado
        pela loja, ou pagamento automático). Os preços e taxas apresentados no site são calculados e
        confirmados pelo nosso servidor no momento da compra.
      </p>

      <h2 className="font-semibold" style={{ color: 'var(--st-text)' }}>2. Disponibilidade</h2>
      <p>
        Os artigos apresentados estão sujeitos a disponibilidade de stock. Caso um artigo deixe de estar
        disponível após a encomenda, a {brand.name} entrará em contacto para propor alternativa, crédito
        ou reembolso.
      </p>

      <h2 className="font-semibold" style={{ color: 'var(--st-text)' }}>3. Entrega e levantamento</h2>
      <p>
        As opções de entrega (por zona) e levantamento, respetivos prazos e taxas são apresentados no
        checkout antes da confirmação da compra.
      </p>

      <h2 className="font-semibold" style={{ color: 'var(--st-text)' }}>4. Pagamento</h2>
      <p>
        Aceitamos M-Pesa e e-Mola. No pagamento manual, a encomenda só é preparada após o comprovativo
        ser aprovado pela loja.
      </p>

      <h2 className="font-semibold" style={{ color: 'var(--st-text)' }}>5. Contacto</h2>
      <p>Para questões sobre estes termos, contacte-nos através dos canais indicados na loja.</p>
    </LegalShell>
  );
}
