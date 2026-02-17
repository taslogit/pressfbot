import React, { createContext, useContext, useState, useEffect } from 'react';
import { storage } from '../utils/storage';
import { translations, Language } from '../utils/translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof typeof translations['en'], params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // По умолчанию русский; язык только из сохранённых настроек (localStorage + API)
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window === 'undefined') return 'ru';
    const settings = storage.getSettings();
    return (settings.language === 'en' || settings.language === 'ru') ? settings.language : 'ru';
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = language === 'ru' ? 'ru' : 'en';
    document.documentElement.classList.toggle('lang-ru', language === 'ru');
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    storage.updateSettings({ language: lang });
    storage.updateSettingsAsync({ language: lang }).catch(() => {});
  };

  const t = (key: keyof typeof translations['en'], params?: Record<string, string | number>) => {
    let text = translations[language][key] || translations['en'][key] || key;
    
    if (params) {
      Object.entries(params).forEach(([paramKey, value]) => {
        text = text.replace(`{{${paramKey}}}`, String(value));
      });
    }
    
    return text;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return context;
};