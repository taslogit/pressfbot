import React, { useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Trophy, Mail, X, Share2, ClipboardCopy } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';
import { tg } from '../utils/telegram';
import { storage } from '../utils/storage';

const SharePost = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const type = params.get('type') || 'duel_win';
  const title = params.get('title') || '';
  const opponent = params.get('opponent') || '';

  const isDuel = type === 'duel_win';
  const defaultStyle = isDuel ? 'neon' : 'goth';
  const styleParam = params.get('style') || defaultStyle;
  const templates = useMemo(() => ([
    {
      id: 'cyber',
      label: t('share_template_cyber'),
      cardClass: 'bg-gradient-to-br from-[#0b1220] via-[#0a2b3f] to-[#0b1220] border-accent-cyan/40 shadow-[0_0_35px_rgba(34,211,238,0.25)]',
      accentClass: 'text-accent-cyan',
      chipClass: 'border-accent-cyan/40 bg-accent-cyan/10'
    },
    {
      id: 'neon',
      label: t('share_template_neon'),
      cardClass: 'bg-gradient-to-br from-[#1a0b24] via-[#240b2c] to-[#14081b] border-accent-pink/40 shadow-[0_0_35px_rgba(244,114,182,0.25)]',
      accentClass: 'text-accent-pink',
      chipClass: 'border-accent-pink/40 bg-accent-pink/10'
    },
    {
      id: 'goth',
      label: t('share_template_goth'),
      cardClass: 'bg-gradient-to-br from-[#0b0b0b] via-[#161616] to-[#0b0b0b] border-accent-gold/30 shadow-[0_0_35px_rgba(255,215,0,0.18)]',
      accentClass: 'text-accent-gold',
      chipClass: 'border-accent-gold/30 bg-accent-gold/10'
    }
  ]), [t]);
  const [templateId, setTemplateId] = useState(styleParam);
  const [messageId, setMessageId] = useState(0);
  const template = templates.find((item) => item.id === templateId) || templates[0];
  const previewRef = useRef<HTMLDivElement | null>(null);
  const nowStamp = useMemo(() => new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date()), []);
  const headline = isDuel ? t('share_post_title_duel') : t('share_post_title_letter');
  const subtitle = isDuel
    ? t('share_post_subtitle_duel', { title, opponent })
    : t('share_post_subtitle_letter', { title });
  const caption = isDuel
    ? t('share_post_caption_duel', { title, opponent })
    : t('share_post_caption_letter', { title });

  const messageVariants = useMemo(() => (
    isDuel
      ? [
        t('share_duel_win_text', { title: title || 'Beef', opponent: opponent || '??' }),
        t('share_duel_win_text_alt1', { title: title || 'Beef', opponent: opponent || '??' }),
        t('share_duel_win_text_alt2', { title: title || 'Beef', opponent: opponent || '??' })
      ]
      : [
        t('share_letter_text', { title: title || 'Drop' }),
        t('share_letter_text_alt1', { title: title || 'Drop' }),
        t('share_letter_text_alt2', { title: title || 'Drop' })
      ]
  ), [isDuel, opponent, t, title]);

  const buildShareText = () => messageVariants[messageId] || messageVariants[0];

  const rememberShare = () => {
    storage.addShareHistory({
      id: `${type}-${Date.now()}`,
      type: isDuel ? 'duel_win' : 'letter_unlock',
      title: title || undefined,
      opponent: opponent || undefined,
      createdAt: Date.now()
    });
  };

  const handleShare = () => {
    const url = window.location.origin;
    const text = buildShareText();
    tg.openLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
    rememberShare();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildShareText());
      tg.showPopup({ message: t('share_copied') });
      rememberShare();
    } catch {
      tg.showPopup({ message: t('share_copy_failed') });
    }
  };

  const handleDownload = async () => {
    if (!previewRef.current) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(previewRef.current, { backgroundColor: null, scale: 2 });
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
      if (!blob) throw new Error('blob');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `pressf-share-${type}.png`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      tg.showPopup({ message: t('share_download_failed') });
    }
  };

  return (
    <div className="pt-4 pb-24 relative min-h-[80vh]">
      <div className="relative z-10">
        <div className="flex justify-between items-center mb-4">
          <h1 className="font-heading text-2xl font-black uppercase tracking-widest flex items-center gap-3 text-accent-gold drop-shadow-[0_0_10px_rgba(255,215,0,0.8)]">
            {isDuel ? <Trophy size={28} className="text-accent-gold" /> : <Mail size={28} className="text-accent-gold" />}
            {t('share_post_title')}
          </h1>
          <button onClick={() => navigate(-1)} className="p-2 rounded-full border border-border text-muted hover:text-primary">
            <X size={20} />
          </button>
        </div>

        <div className="bg-card/70 border border-border rounded-2xl p-5 shadow-xl">
          <div className="text-xs uppercase tracking-widest text-muted mb-2">{headline}</div>
          <div className="font-heading text-lg font-black text-primary mb-2">{subtitle}</div>
          <div className="text-xs text-muted mb-4">{caption}</div>

          <div className="mb-3 text-xs uppercase tracking-widest text-muted">{t('share_template_title')}</div>
          <div className="flex flex-wrap gap-2 mb-4">
            {templates.map((item) => (
              <button
                key={item.id}
                onClick={() => setTemplateId(item.id)}
                className={`px-3 py-1 rounded-full text-xs uppercase tracking-widest border transition-all ${item.chipClass} ${
                  templateId === item.id ? 'text-primary' : 'text-muted'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mb-3 text-xs uppercase tracking-widest text-muted">{t('share_message_title')}</div>
          <div className="flex flex-wrap gap-2 mb-4">
            {messageVariants.map((text, index) => (
              <button
                key={`${index}-${text.slice(0, 12)}`}
                onClick={() => setMessageId(index)}
                className={`px-3 py-1 rounded-full text-xs uppercase tracking-widest border transition-all border-border ${
                  messageId === index ? 'text-primary' : 'text-muted'
                }`}
              >
                {t('share_message_variant', { n: index + 1 })}
              </button>
            ))}
          </div>

          <div ref={previewRef} className={`relative overflow-hidden border rounded-xl p-4 font-mono text-xs ${template.cardClass}`}>
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_55%)]" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3 text-xs uppercase tracking-widest">
                <span className={`px-2 py-1 rounded-full border ${template.chipClass} ${template.accentClass}`}>
                  {isDuel ? t('share_badge_win') : t('share_badge_unlock')}
                </span>
                <span className="text-muted">{template.label}</span>
              </div>
            {isDuel ? (
              <div className="flex items-center justify-between">
                <span className="text-primary">{title || t('share_post_fallback')}</span>
                <span className={template.accentClass}>vs {opponent || '??'}</span>
              </div>
            ) : (
              <div className="text-primary">{title || t('share_post_fallback')}</div>
            )}
            <div className="mt-3 pt-3 border-t border-border/60">
              <div className="text-xs uppercase tracking-widest text-muted mb-2">{t('share_timeline_title')}</div>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className={`mt-1 h-2 w-2 rounded-full ${template.accentClass}`} />
                  <div>
                    <div className="text-xs text-muted">{nowStamp}</div>
                    <div className="text-xs text-primary">{t('share_timeline_action')}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-1 h-2 w-2 rounded-full bg-white/40" />
                  <div>
                    <div className="text-xs text-muted">{t('share_timeline_actor')}</div>
                    <div className="text-xs text-primary">{t('share_timeline_you')}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-1 h-2 w-2 rounded-full bg-white/40" />
                  <div>
                    <div className="text-xs text-muted">{t('share_timeline_object')}</div>
                    <div className="text-xs text-primary">
                      {isDuel ? t('share_timeline_beef', { title: title || t('share_post_fallback') }) : t('share_timeline_letter', { title: title || t('share_post_fallback') })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between text-xs uppercase tracking-widest text-muted">
              <span>PRESS F</span>
              <span>{t('share_post_footer')}</span>
            </div>
            </div>
          </div>

          <button
            onClick={handleShare}
            className="mt-4 w-full px-3 py-2 rounded-lg border border-accent-cyan/40 text-accent-cyan bg-accent-cyan/10 hover:bg-accent-cyan/20 transition-all font-bold tracking-widest text-xs uppercase flex items-center justify-center gap-2"
          >
            <Share2 size={14} /> {t('share_post_cta')}
          </button>
          <button
            onClick={handleCopy}
            className="mt-2 w-full px-3 py-2 rounded-lg border border-border text-muted hover:text-primary transition-all font-bold tracking-widest text-xs uppercase flex items-center justify-center gap-2"
          >
            <ClipboardCopy size={14} /> {t('share_copy')}
          </button>
          <button
            onClick={handleDownload}
            className="mt-2 w-full px-3 py-2 rounded-lg border border-border text-muted hover:text-primary transition-all font-bold tracking-widest text-xs uppercase flex items-center justify-center gap-2"
          >
            {t('share_download')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SharePost;
