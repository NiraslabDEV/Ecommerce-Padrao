import { SettingsSection } from '../settings-section';
import { PaysuiteSection } from '../paysuite-section';
import { PromoSection } from '../promo-section';
import { AppearanceSection } from '../appearance-section';

export default function DefinicoesPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-[var(--adm-text)] tracking-tight mb-6">Definições</h1>
        <SettingsSection />
      </div>
      <div className="border-t border-[var(--adm-border)] pt-8">
        <AppearanceSection />
      </div>
      <div className="border-t border-[var(--adm-border)] pt-8">
        <PaysuiteSection />
      </div>
      <div className="border-t border-[var(--adm-border)] pt-8">
        <PromoSection />
      </div>
    </div>
  );
}
