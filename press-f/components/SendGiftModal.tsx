import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, X, Send, Sparkles } from 'lucide-react';
import { giftsAPI } from '../utils/api';
import { useTranslation } from '../contexts/LanguageContext';
import { tg } from '../utils/telegram';
import { playSound } from '../utils/sound';

interface GiftType {
  type: string;
  name: string;
  icon: string;
  cost: number;
  rarity: 'common' | 'rare' | 'legendary';
  effect: {
    type: string;
    description: string;
  };
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  recipientId: number;
  recipientName?: string;
  onGiftSent?: () => void;
}

const SendGiftModal: React.FC<Props> = ({ isOpen, onClose, recipientId, recipientName, onGiftSent }) => {
  const { t } = useTranslation();
  const [giftTypes, setGiftTypes] = useState<GiftType[]>([]);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadGiftTypes();
    }
  }, [isOpen]);

  const loadGiftTypes = async () => {
    try {
      const result = await giftsAPI.getTypes();
      if (result.ok && result.data?.types) {
        setGiftTypes(result.data.types);
      }
    } catch (error) {
      console.error('Failed to load gift types:', error);
    }
  };

  const handleSend = async () => {
    if (!selectedType) {
      tg.showPopup({ message: t('select_gift') || 'Please select a gift' });
      return;
    }

    setSending(true);
    playSound('click');

    try {
      const result = await giftsAPI.send(recipientId, selectedType, message);
      if (result.ok) {
        playSound('success');
        tg.showPopup({ message: t('gift_sent') || 'Gift sent!' });
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        onGiftSent?.();
        onClose();
        setSelectedType(null);
        setMessage('');
      } else {
        throw new Error(result.error || 'Failed to send gift');
      }
    } catch (error: any) {
      playSound('error');
      tg.showPopup({ message: error.message || t('gift_send_failed') || 'Failed to send gift' });
      if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
    } finally {
      setSending(false);
    }
  };

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'legendary': return 'border-yellow-500 bg-yellow-500/10';
      case 'rare': return 'border-purple-500 bg-purple-500/10';
      default: return 'border-border bg-card/50';
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          className="bg-card border border-purple-500/50 rounded-2xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto relative"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-accent-cyan to-accent-pink" />
          
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <Gift size={20} className="text-accent-pink" />
              <h3 className="text-lg font-black uppercase tracking-wider text-purple-400">
                {t('send_gift') || 'Send Gift'}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="text-muted hover:text-primary transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {recipientName && (
            <div className="text-sm text-muted mb-4">
              {t('to') || 'To'}: <span className="text-primary font-bold">{recipientName}</span>
            </div>
          )}

          <div className="space-y-4">
            {/* Gift Types */}
            <div>
              <label className="text-xs uppercase tracking-wider text-muted mb-2 block">
                {t('select_gift_type') || 'Select Gift Type'}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {giftTypes.map((gift) => (
                  <motion.button
                    key={gift.type}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      setSelectedType(gift.type);
                      playSound('click');
                    }}
                    className={`p-3 rounded-xl border-2 transition-all text-left ${
                      selectedType === gift.type
                        ? `${getRarityColor(gift.rarity)} shadow-lg`
                        : 'border-border bg-card/50 hover:border-purple-500/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-2xl">{gift.icon}</span>
                      <div className="flex-1">
                        <div className="text-xs font-bold text-white">{gift.name}</div>
                        <div className="text-xs text-accent-gold font-black">
                          {gift.cost} REP
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-muted mt-1">
                      {gift.effect.description}
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Message */}
            <div>
              <label className="text-xs uppercase tracking-wider text-muted mb-2 block">
                {t('message_optional') || 'Message (optional)'}
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('gift_message_placeholder') || 'Add a message...'}
                className="w-full bg-input border border-border rounded-xl p-3 text-sm text-primary outline-none focus:border-purple-500 resize-none h-20"
                maxLength={200}
              />
            </div>

            {/* Send Button */}
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleSend}
              disabled={!selectedType || sending}
              className={`w-full py-3 rounded-xl font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                selectedType && !sending
                  ? 'bg-gradient-to-r from-purple-500 to-accent-cyan text-white shadow-lg hover:shadow-xl'
                  : 'bg-card border border-border text-muted cursor-not-allowed'
              }`}
            >
              {sending ? (
                <>
                  <Sparkles size={16} className="animate-spin" />
                  {t('sending') || 'Sending...'}
                </>
              ) : (
                <>
                  <Send size={16} />
                  {t('send_gift') || 'Send Gift'}
                </>
              )}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default SendGiftModal;
