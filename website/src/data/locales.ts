export type LocaleId =
  | 'en'
  | 'es'
  | 'fr'
  | 'de'
  | 'pt'
  | 'ru'
  | 'zh'
  | 'hi'
  | 'ar'
  | 'ur'
  | 'bn'
  | 'ja';

export interface LocaleInfo {
  id: LocaleId;
  label: string;
  nativeLabel: string;
  dir: 'ltr' | 'rtl';
}

export const locales: LocaleInfo[] = [
  { id: 'en', label: 'English', nativeLabel: 'English', dir: 'ltr' },
  { id: 'es', label: 'Spanish', nativeLabel: 'Español', dir: 'ltr' },
  { id: 'fr', label: 'French', nativeLabel: 'Français', dir: 'ltr' },
  { id: 'de', label: 'German', nativeLabel: 'Deutsch', dir: 'ltr' },
  { id: 'pt', label: 'Portuguese', nativeLabel: 'Português', dir: 'ltr' },
  { id: 'ru', label: 'Russian', nativeLabel: 'Русский', dir: 'ltr' },
  { id: 'zh', label: 'Chinese', nativeLabel: '中文', dir: 'ltr' },
  { id: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी', dir: 'ltr' },
  { id: 'ar', label: 'Arabic', nativeLabel: 'العربية', dir: 'rtl' },
  { id: 'ur', label: 'Urdu', nativeLabel: 'اردو', dir: 'rtl' },
  { id: 'bn', label: 'Bengali', nativeLabel: 'বাংলা', dir: 'ltr' },
  { id: 'ja', label: 'Japanese', nativeLabel: '日本語', dir: 'ltr' },
];

export const defaultLocale: LocaleId = 'en';

function withBase(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const trimmedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${trimmedBase}${path.startsWith('/') ? path : `/${path}`}`;
}

export function localePath(locale: LocaleId, path = ''): string {
  const clean = path.replace(/^\/+/, '');
  if (locale === defaultLocale) {
    return clean ? withBase(`/${clean}`) : `${withBase('/')}` || '/';
  }
  return clean ? withBase(`/${locale}/${clean}`) : withBase(`/${locale}/`);
}
