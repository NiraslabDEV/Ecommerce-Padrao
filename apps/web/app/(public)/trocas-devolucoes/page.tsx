import type { Metadata } from 'next';
import { brand } from '@brand';
import LegalShell from '../legal-shell';

export const metadata: Metadata = { title: 'Trocas e Devoluções' };

export default function TrocasDevolucoesPage() {
  return (
    <LegalShell title="Trocas e Devoluções">
      <p>
        Queremos que fique satisfeito com a sua compra na {brand.name}. Se um artigo não for o que
        esperava, seguimos a política abaixo.
      </p>

      <h2 className="font-semibold" style={{ color: 'var(--st-text)' }}>1. Prazo</h2>
      <p>
        Pode solicitar troca ou devolução até 7 dias após a receção do artigo, desde que o artigo esteja
        em condições originais, sem uso e com as etiquetas.
      </p>

      <h2 className="font-semibold" style={{ color: 'var(--st-text)' }}>2. Como pedir</h2>
      <p>
        Contacte a loja pelos canais indicados, informando o número da encomenda e o motivo da troca ou
        devolução.
      </p>

      <h2 className="font-semibold" style={{ color: 'var(--st-text)' }}>3. Artigos não elegíveis</h2>
      <p>
        Artigos de higiene pessoal (ex.: perfumaria aberta) e artigos personalizados não são elegíveis
        para troca, salvo defeito de fabrico.
      </p>

      <h2 className="font-semibold" style={{ color: 'var(--st-text)' }}>4. Reembolso</h2>
      <p>
        Após confirmação do artigo devolvido, o reembolso ou crédito é processado nos métodos combinados
        com a loja.
      </p>
    </LegalShell>
  );
}
