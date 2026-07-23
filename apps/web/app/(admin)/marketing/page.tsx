import { MarketingSection } from '../marketing-section';

export default function MarketingPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-white tracking-tight mb-2">Marketing &amp; Rastreio</h1>
      <p className="text-sm text-[#A8A8B0] mb-2">
        Cole aqui os IDs e tokens das plataformas. Tudo fica configurado sem tocar em ficheiros.
      </p>
      <p className="text-sm text-[#EA1D2C] mb-6">
        📖 Manual passo-a-passo (onde encontrar cada ID + dúvidas comuns):{' '}
        <code className="text-[#A8A8B0]">docs/marketing-setup.md</code>
      </p>
      <MarketingSection />
    </div>
  );
}
