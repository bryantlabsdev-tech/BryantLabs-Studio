import { APP_INFO } from "@/core/appInfo";
import { BrandLogo } from "@/components/BrandLogo";

/** Settings / About panel with product identity. */
export function AboutBrandPanel() {
  return (
    <section className="about-brand-panel" data-testid="about-brand-panel">
      <div className="about-brand-panel__hero">
        <BrandLogo size={56} className="about-brand-panel__logo" />
        <div>
          <h3 className="about-brand-panel__title">{APP_INFO.name}</h3>
          <p className="about-brand-panel__meta">
            Version {APP_INFO.version} · {APP_INFO.tagline}
          </p>
        </div>
      </div>
      <p className="about-brand-panel__phase plan__muted">{APP_INFO.phase}</p>
    </section>
  );
}
