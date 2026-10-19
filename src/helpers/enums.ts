/** Supported locales and their `language_COUNTRY` raw values. */
export const SupportedLocale = {
  ar: 'ar',
  arAE: 'ar_AE',
  arBH: 'ar_BH',
  arDZ: 'ar_DZ',
  arEG: 'ar_EG',
  arIQ: 'ar_IQ',
  arJO: 'ar_JO',
  arKW: 'ar_KW',
  arLB: 'ar_LB',
  arLY: 'ar_LY',
  arMA: 'ar_MA',
  arOM: 'ar_OM',
  arQA: 'ar_QA',
  arSA: 'ar_SA',
  arSD: 'ar_SD',
  arSY: 'ar_SY',
  arTN: 'ar_TN',
  arYE: 'ar_YE',
  en: 'en',
  enAu: 'en_AU',
  enCa: 'en_CA',
  enGb: 'en_GB',
  enUs: 'en_US',
  de: 'de',
  deDe: 'de_DE',
  deAt: 'de_AT',
  deCh: 'de_CH',
  es: 'es',
  esEs: 'es_ES',
  esMx: 'es_MX',
  fr: 'fr',
  frCa: 'fr_CA',
  frFr: 'fr_FR',
  caEs: 'ca_ES',
  csCz: 'cs_CZ',
  daDk: 'da_DK',
  elGr: 'el_GR',
  fiFi: 'fi_FI',
  hiIn: 'hi_IN',
  hrHr: 'hr_HR',
  huHu: 'hu_HU',
  idId: 'id_ID',
  itIt: 'it_IT',
  jaJp: 'ja_JP',
  koKr: 'ko_KR',
  msMy: 'ms_MY',
  nbNo: 'nb_NO',
  nlNl: 'nl_NL',
  plPl: 'pl_PL',
  ptBr: 'pt_BR',
  ptPt: 'pt_PT',
  roRo: 'ro_RO',
  ruRu: 'ru_RU',
  skSk: 'sk_SK',
  svSe: 'sv_SE',
  thTh: 'th_TH',
  trTr: 'tr_TR',
  ukUa: 'uk_UA',
  viVn: 'vi_VN',
  zhCn: 'zh_CN',
  zhHk: 'zh_HK',
  zhTw: 'zh_TW',
} as const;

export type SupportedLocaleKey = keyof typeof SupportedLocale;
export type SupportedLocaleValue = (typeof SupportedLocale)[SupportedLocaleKey];

export interface Locale {
  languageCode: string;
  countryCode?: string;
}

/** Parses a raw value such as `ar_EG` (or `ar-EG`) into a [Locale]. */
export function toLocale(rawValue: string): Locale {
  const [languageCode, countryCode] = rawValue.split(/[_-]/);
  return countryCode ? { languageCode, countryCode } : { languageCode };
}

/** BCP 47 tag, e.g. `ar-EG`. */
export function localeTag(locale: Locale): string {
  return locale.countryCode ? `${locale.languageCode}-${locale.countryCode}` : locale.languageCode;
}
