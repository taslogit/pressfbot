import React from 'react';
import { BookOpen, ChevronRight } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';
import InfoSection from '../components/InfoSection';

const WIKI_TOPICS = [
  { key: 'checkin', topic: 'wiki_topic_checkin', content: 'wiki_checkin' },
  { key: 'xp', topic: 'wiki_topic_xp', content: 'wiki_xp' },
  { key: 'store', topic: 'wiki_topic_store', content: 'wiki_store' },
  { key: 'letters', topic: 'wiki_topic_letters', content: 'wiki_letters' },
  { key: 'duels', topic: 'wiki_topic_duels', content: 'wiki_duels' },
  { key: 'squads', topic: 'wiki_topic_squads', content: 'wiki_squads' },
  { key: 'legacy', topic: 'wiki_topic_legacy', content: 'wiki_legacy' },
  { key: 'witnesses', topic: 'wiki_topic_witnesses', content: 'wiki_witnesses' },
];

const Wiki = () => {
  const { t } = useTranslation();

  return (
    <div className="pt-4 pb-24 min-h-[80vh]">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-accent-cyan/10 border border-accent-cyan/30 flex items-center justify-center">
          <BookOpen size={22} className="text-accent-cyan" />
        </div>
        <div>
          <h2 className="text-xl font-black uppercase tracking-widest text-accent-cyan">
            {t('wiki_title')}
          </h2>
          <p className="text-xs text-muted">{t('wiki_intro')}</p>
        </div>
      </div>

      <div className="space-y-2">
        {WIKI_TOPICS.map(({ key, topic, content }) => (
          <InfoSection
            key={key}
            title={t(topic)}
            description={t(content)}
            trigger={
              <div className="flex items-center justify-between py-3 px-4 rounded-xl border border-border/60 bg-card/40 text-left hover:border-accent-cyan/50 hover:bg-accent-cyan/5 transition-colors">
                <span className="text-sm font-bold text-primary">{t(topic)}</span>
                <ChevronRight size={18} className="text-muted" />
              </div>
            }
          />
        ))}
      </div>
    </div>
  );
};

export default Wiki;
