import {createContext, useContext, useEffect, useState, type ReactNode} from 'react';
import type {Locale} from '../../shared/types';
import sinhala from './si.json';

const preferenceKey = 'retail-pos-language';
const dictionary: Readonly<Record<string, string>> = sinhala;
type TranslationValue = string | number | boolean | null | undefined;

const LanguageContext = createContext<{locale: Locale; setLocale: (locale: Locale) => void}>({
  locale: 'en',
  setLocale: () => {},
});

function readLanguage(): Locale {
  try { return localStorage.getItem(preferenceKey) === 'si' ? 'si' : 'en'; }
  catch { return 'en'; }
}

export function translate(locale: Locale, message: string, ...values: TranslationValue[]): string {
  const template = locale === 'si' && Object.hasOwn(dictionary, message) ? dictionary[message] : message;
  if (!values.length) return template;
  return template.replace(/\{(\d+)\}/g, (placeholder, index) =>
    Number(index) < values.length ? String(values[Number(index)] ?? '') : placeholder);
}

const translators = {
  en: (message: string, ...values: TranslationValue[]) => translate('en', message, ...values),
  si: (message: string, ...values: TranslationValue[]) => translate('si', message, ...values),
};

export function useTranslation() {
  return translators[useContext(LanguageContext).locale];
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function LanguageProvider({children}: {children: ReactNode}) {
  const [locale, setLocale] = useState(readLanguage);
  useEffect(() => {
    document.documentElement.lang = locale;
    try { localStorage.setItem(preferenceKey, locale); } catch { /* This session can still switch languages. */ }
  }, [locale]);
  return <LanguageContext.Provider value={{locale, setLocale}}>{children}</LanguageContext.Provider>;
}

export function LanguageToggle({className = ''}: {className?: string}) {
  const {locale, setLocale} = useLanguage();
  const next = locale === 'en' ? 'si' : 'en';
  const label = next === 'si' ? 'සිංහල' : 'English';
  return <button type="button" className={'button button-ghost language-toggle ' + className} lang={next}
    title={label} onClick={() => setLocale(next)}>{label}</button>;
}
