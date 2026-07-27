import type { Metadata } from 'next';
import { brand } from '@brand';
import LegalShell from '../legal-shell';

export const metadata: Metadata = { title: 'Política de Privacidade' };

export default function PrivacidadePage() {
  return (
    <LegalShell title="Política de Privacidade">
      <p>
        A {brand.name} respeita a privacidade dos seus clientes. Esta página descreve que dados
        recolhemos e para quê.
      </p>

      <h2 className="font-semibold" style={{ color: 'var(--st-text)' }}>1. Dados recolhidos</h2>
      <p>
        Nome, telefone, morada de entrega (quando aplicável) e comprovativo de pagamento (fluxo manual).
        Estes dados são usados apenas para processar a sua encomenda e contactá-lo sobre o seu pedido.
      </p>

      <h2 className="font-semibold" style={{ color: 'var(--st-text)' }}>2. Pagamentos</h2>
      <p>
        Comprovativos de pagamento são guardados de forma privada e apenas a equipa da loja tem acesso
        para confirmar a encomenda.
      </p>

      <h2 className="font-semibold" style={{ color: 'var(--st-text)' }}>3. Cookies e análise</h2>
      <p>
        Podemos usar cookies próprios e, quando o cliente autoriza, ferramentas de análise (ex.: Google
        Analytics, Meta Pixel) para entender o desempenho da loja. Nenhuma destas ferramentas é ativada
        sem consentimento.
      </p>

      <h2 className="font-semibold" style={{ color: 'var(--st-text)' }}>4. Partilha de dados</h2>
      <p>
        Não vendemos nem partilhamos os seus dados com terceiros, exceto quando necessário para processar
        o pagamento (ex.: processadora de pagamentos) ou a entrega.
      </p>

      <h2 className="font-semibold" style={{ color: 'var(--st-text)' }}>5. Os seus direitos</h2>
      <p>Pode solicitar a atualização ou remoção dos seus dados contactando a loja diretamente.</p>
    </LegalShell>
  );
}
