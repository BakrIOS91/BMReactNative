import { Locale, SupportedLocale, SupportedLocaleValue, toLocale } from './enums';

export abstract class LanguageManager {
  /** Override to restrict the supported list. Defaults to every [SupportedLocale]. */
  get supported(): readonly SupportedLocaleValue[] {
    return Object.values(SupportedLocale);
  }

  /** Fallback when the device locale is not supported. */
  get fallback(): SupportedLocaleValue {
    return SupportedLocale.enUs;
  }

  get supportedLocales(): Locale[] {
    return this.supported.map(toLocale);
  }

  get fallbackLocale(): Locale {
    return toLocale(this.fallback);
  }

  /**
   * Resolves the device locale: no locale → fallback; any Arabic → generic
   * `ar`; otherwise the first supported locale with the same language code, or
   * the fallback.
   */
  resolve(deviceLocale?: Locale | null): Locale {
    if (!deviceLocale) return this.fallbackLocale;
    if (deviceLocale.languageCode === 'ar') return { languageCode: 'ar' };
    return (
      this.supportedLocales.find((l) => l.languageCode === deviceLocale.languageCode) ??
      this.fallbackLocale
    );
  }
}
