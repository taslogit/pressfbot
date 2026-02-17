import React from 'react';
import { motion } from 'framer-motion';
import { BookOpen, ChevronRight, Skull, Zap, ShoppingBag, FileText, Swords, Users, Package, ShieldCheck, User, Settings } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';
import InfoSection from '../components/InfoSection';
import { playSound } from '../utils/sound';

const WIKI_SECTIONS = [
  {
    sectionKey: 'wiki_section_settings',
    topics: [
      { key: 'settings', topic: 'wiki_topic_settings', content: 'wiki_settings', icon: Settings },
    ],
  },
  {
    sectionKey: 'wiki_section_gamification',
    topics: [
      { key: 'checkin', topic: 'wiki_topic_checkin', content: 'wiki_checkin', icon: Skull },
      { key: 'xp', topic: 'wiki_topic_xp', content: 'wiki_xp', icon: Zap },
    ],
  },
  {
    sectionKey: 'wiki_section_shop',
    topics: [
      { key: 'store', topic: 'wiki_topic_store', content: 'wiki_store', icon: ShoppingBag },
      { key: 'avatars', topic: 'wiki_topic_avatars', content: 'wiki_avatars', icon: User },
    ],
  },
  {
    sectionKey: 'wiki_section_content',
    topics: [
      { key: 'letters', topic: 'wiki_topic_letters', content: 'wiki_letters', icon: FileText },
      { key: 'duels', topic: 'wiki_topic_duels', content: 'wiki_duels', icon: Swords },
    ],
  },
  {
    sectionKey: 'wiki_section_social',
    topics: [
      { key: 'squads', topic: 'wiki_topic_squads', content: 'wiki_squads', icon: Users },
      { key: 'witnesses', topic: 'wiki_topic_witnesses', content: 'wiki_witnesses', icon: ShieldCheck },
    ],
  },
  {
    sectionKey: 'wiki_section_legacy',
    topics: [
      { key: 'legacy', topic: 'wiki_topic_legacy', content: 'wiki_legacy', icon: Package },
    ],
  },
];

const WIKI_CARD_STYLE = 'flex items-center gap-3 py-4 px-4 rounded-2xl border border-border bg-card/60 backdrop-blur-md text-left hover:border-accent-cyan/50 hover:bg-accent-cyan/5 transition-all cursor-pointer group';

const Wiki = () => {
  const { t } = useTranslation();

  return (
    <div className="pt-4 pb-24 min-h-[80vh] relative">
      {/* Background Animation — same as Landing, Store */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 flex items-center justify-center">
        <div className="bg-decor opacity-[0.05] text-accent-cyan drop-shadow-[0_0_30px_rgba(0,224,255,0.3)] animate-spin-slow">
          <BookOpen size={450} strokeWidth={0.5} />
        </div>
      </div>

      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-accent-cyan/10 border border-accent-cyan/30 flex items-center justify-center">
            <BookOpen size={22} className="text-accent-cyan" />
          </div>
          <div>
            <h1 className="font-heading text-xl font-black uppercase tracking-widest text-accent-cyan">
              {t('wiki_title')}
            </h1>
            <p className="text-xs text-muted">{t('wiki_intro')}</p>
          </div>
        </div>

        <div className="space-y-6">
          {WIKI_SECTIONS.map(({ sectionKey, topics }, sectionIndex) => (
            <motion.section
              key={sectionKey}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: sectionIndex * 0.05 }}
              className="space-y-3"
            >
              <h2 className="font-heading text-xs font-black uppercase tracking-widest text-muted border-b border-border/60 pb-2 mb-1">
                {t(sectionKey)}
              </h2>
              {topics.map(({ key, topic, content, icon: Icon }, i) => (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: sectionIndex * 0.05 + i * 0.04 }}
                >
                  <InfoSection
                    title={t(topic)}
                    description={t(content)}
                    trigger={
                      <div
                        onClick={() => playSound('click')}
                        className={WIKI_CARD_STYLE}
                      >
                        <div className="w-10 h-10 rounded-xl bg-accent-cyan/10 border border-accent-cyan/30 flex items-center justify-center flex-shrink-0">
                          <Icon size={20} className="text-accent-cyan" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-bold text-primary block">{t(topic)}</span>
                        </div>
                        <ChevronRight size={18} className="text-muted group-hover:text-accent-cyan flex-shrink-0" />
                      </div>
                    }
                  />
                </motion.div>
              ))}
            </motion.section>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Wiki;
