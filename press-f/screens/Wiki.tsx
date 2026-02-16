import React from 'react';
import { motion } from 'framer-motion';
import { BookOpen, ChevronRight, Skull, Zap, ShoppingBag, FileText, Swords, Users, Package, ShieldCheck, User } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';
import InfoSection from '../components/InfoSection';
import { playSound } from '../utils/sound';

const WIKI_TOPICS = [
  { key: 'checkin', topic: 'wiki_topic_checkin', content: 'wiki_checkin', icon: Skull },
  { key: 'xp', topic: 'wiki_topic_xp', content: 'wiki_xp', icon: Zap },
  { key: 'avatars', topic: 'wiki_topic_avatars', content: 'wiki_avatars', icon: User },
  { key: 'store', topic: 'wiki_topic_store', content: 'wiki_store', icon: ShoppingBag },
  { key: 'letters', topic: 'wiki_topic_letters', content: 'wiki_letters', icon: FileText },
  { key: 'duels', topic: 'wiki_topic_duels', content: 'wiki_duels', icon: Swords },
  { key: 'squads', topic: 'wiki_topic_squads', content: 'wiki_squads', icon: Users },
  { key: 'legacy', topic: 'wiki_topic_legacy', content: 'wiki_legacy', icon: Package },
  { key: 'witnesses', topic: 'wiki_topic_witnesses', content: 'wiki_witnesses', icon: ShieldCheck },
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

        <div className="space-y-3">
          {WIKI_TOPICS.map(({ key, topic, content, icon: Icon }, i) => (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
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
        </div>
      </div>
    </div>
  );
};

export default Wiki;
