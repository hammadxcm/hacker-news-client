import type { LocaleId } from '../data/locales';
import { ar } from './translations/ar';
import { bn } from './translations/bn';
import { de } from './translations/de';
import { en, type TranslationDict, type TranslationKey } from './translations/en';
import { es } from './translations/es';
import { fr } from './translations/fr';
import { hi } from './translations/hi';
import { ja } from './translations/ja';
import { pt } from './translations/pt';
import { ru } from './translations/ru';
import { ur } from './translations/ur';
import { zh } from './translations/zh';

const dictionaries: Record<LocaleId, TranslationDict> = {
  en,
  es,
  fr,
  de,
  pt,
  ru,
  zh,
  hi,
  ar,
  ur,
  bn,
  ja,
};

export type Translator = (key: TranslationKey) => string;

export function getTranslator(locale: LocaleId = 'en'): Translator {
  const dict = dictionaries[locale] ?? en;
  return (key) => dict[key] ?? en[key] ?? key;
}

export type { LocaleId, TranslationKey };
