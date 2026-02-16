
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, Image as ImageIcon, Video, X, Trash2, StopCircle, FileAudio, Play, AtSign, User, Calendar, AlertCircle, Save, Shield, Flame, Key, Heart, Skull, Terminal, EyeOff, Lock, Network, Share2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { storage } from '../utils/storage';
import EnvelopeAnimation from '../components/EnvelopeAnimation';
import { tg } from '../utils/telegram';
import { useTranslation } from '../contexts/LanguageContext';
import InfoSection from '../components/InfoSection';
import { Letter } from '../types';
import { encryptPayload, splitKey } from '../utils/security';
import { uploadToIPFS } from '../services/cloud';
import { lettersAPI } from '../utils/api';
import XPNotification from '../components/XPNotification';
import { calculateLevel } from '../utils/levelSystem';
import { analytics } from '../utils/analytics';
import { useApiAbort } from '../hooks/useApiAbort';

type Attachment = {
  id: string;
  type: 'image' | 'video' | 'audio';
  previewUrl: string;
  file?: File | Blob;
};

type Preset = 'crypto' | 'love' | 'roast' | 'confession';

const CreateLetter = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const getSignal = useApiAbort();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [recipients, setRecipients] = useState('');
  const [unlockDate, setUnlockDate] = useState('');
  const [leakType, setLeakType] = useState<Preset | undefined>(undefined);
  const [burnOnRead, setBurnOnRead] = useState(false);
  
  // Animation States
  const [isSending, setIsSending] = useState(false);
  const [encryptionStep, setEncryptionStep] = useState(0); // 0: idle, 1: encrypting, 2: splitting, 3: uploading, 4: done
  const [hasDraft, setHasDraft] = useState(false);
  const [xpNotification, setXpNotification] = useState<{ xp: number; level?: number; levelUp?: boolean } | null>(null);
  
  // Attachments State
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const recordingInterval = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Check for Draft on Mount
  useEffect(() => {
    const draft = storage.getDraft() as Partial<Letter> & { attachmentsMeta?: { id: string; type: string }[] };
    if (draft && (draft.title || draft.content || (draft.recipients && draft.recipients.length > 0) || (draft.attachmentsMeta && draft.attachmentsMeta.length > 0))) {
      setHasDraft(true);
      if (draft.type) setLeakType(draft.type as Preset);
      if (draft.options?.burnOnRead) setBurnOnRead(draft.options.burnOnRead);
    }
  }, []);

  // Auto-Save Effect (includes attachment metadata — files can't be serialized, user re-adds on restore)
  useEffect(() => {
    if ((title || content || recipients || unlockDate || attachments.length > 0) && !isSending && encryptionStep === 0) {
      const draftData: Partial<Letter> & { attachmentsMeta?: { id: string; type: string }[] } = {
        title,
        content,
        recipients: recipients.split(',').map(r => r.trim()).filter(r => r),
        unlockDate,
        type: leakType,
        options: { burnOnRead }
      };
      if (attachments.length > 0) {
        draftData.attachmentsMeta = attachments.map(a => ({ id: a.id, type: a.type }));
      }
      const timeoutId = setTimeout(() => storage.saveDraft(draftData), 500);
      return () => clearTimeout(timeoutId);
    }
  }, [title, content, recipients, unlockDate, leakType, burnOnRead, isSending, encryptionStep, attachments]);

  const handleRestoreDraft = () => {
    const draft = storage.getDraft() as Partial<Letter> & { attachmentsMeta?: { id: string; type: string }[] };
    if (draft) {
      if (draft.title) setTitle(draft.title);
      if (draft.content) setContent(draft.content);
      if (draft.recipients) setRecipients(draft.recipients.join(', '));
      if (draft.unlockDate) setUnlockDate(draft.unlockDate);
      if (draft.type) setLeakType(draft.type as Preset);
      if (draft.options?.burnOnRead) setBurnOnRead(draft.options.burnOnRead);
      if (draft.attachmentsMeta?.length) {
        setAttachments(draft.attachmentsMeta.map(a => ({
          id: a.id,
          type: a.type as 'image' | 'video' | 'audio',
          previewUrl: '',
          file: undefined
        })));
        tg.showPopup({ message: t('draft_attachments_restore') || 'Add files again' });
      }
    }
    setHasDraft(false);
  };

  const handleDiscardDraft = () => {
    storage.clearDraft();
    setHasDraft(false);
  };

  const validateLetter = (): { valid: boolean; error?: string } => {
    // Check if there's any content
    if (!title && !content && attachments.length === 0) {
      return { valid: false, error: t('save_error') || 'Please add some content' };
    }

    // Validate title length
    if (title && title.length > 500) {
      return { valid: false, error: t('title_too_long') || 'Title is too long (max 500 characters)' };
    }

    // Validate content length (10MB limit)
    if (content && content.length > 10 * 1024 * 1024) {
      return { valid: false, error: t('content_too_large') || 'Content is too large (max 10MB)' };
    }

    // Validate recipients count
    const recipientList = recipients.split(',').map(r => r.trim()).filter(r => r);
    if (recipientList.length > 50) {
      return { valid: false, error: t('too_many_recipients') || 'Too many recipients (max 50)' };
    }

    // Validate attachments count
    if (attachments.length > 10) {
      return { valid: false, error: t('too_many_attachments') || 'Too many attachments (max 10)' };
    }

    return { valid: true };
  };

  const handleSave = async () => {
    const validation = validateLetter();
    if (!validation.valid) {
      tg.showPopup({ message: validation.error || t('save_error') });
      return;
    }

    try {
        // Start Security Protocol
        setEncryptionStep(1); // Encrypting...
        
        // 1. Real AES-256-GCM encryption (content never sent as plaintext)
        const letterId = crypto.randomUUID?.() || `letter_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const encryptedContent = await encryptPayload(content, letterId);
        
        // 2. Key splitting animation (Shamir UI only)
        setEncryptionStep(2);
        splitKey(letterId.slice(0, 16), 3, 2);
        await new Promise(r => setTimeout(r, 1500));

        // 3. IPFS upload animation (stub)
        setEncryptionStep(3);
        await uploadToIPFS(encryptedContent);
        
        // 4. Finalize
        setTimeout(() => {
            setIsSending(true);
            performSave(encryptedContent, letterId);
        }, 1000);
    } catch (e) {
        console.error("Save failed:", e);
        setEncryptionStep(0);
        tg.showPopup({ message: t('error_encryption') });
    }
  };

  const performSave = async (encryptedContent: string, letterId: string) => {
    let attachmentUrls: string[] = [];
    const toUpload = attachments.filter(a => a.file);
    if (toUpload.length > 0) {
      try {
        const opts = { signal: getSignal() };
        for (const att of toUpload) {
          const res = await lettersAPI.uploadAttachment(letterId, att.file!, opts);
          if (!res.ok || !res.data?.url) {
            tg.showPopup({ message: res.error || 'Upload failed' });
            setEncryptionStep(0);
            setIsSending(false);
            return;
          }
          attachmentUrls.push(res.data.url);
        }
      } catch (e) {
        console.error('Attachment upload failed:', e);
        tg.showPopup({ message: 'Upload failed' });
        setEncryptionStep(0);
        setIsSending(false);
        return;
      }
    }

    const letter: Letter = {
      id: letterId,
      title: title || t('new_letter'),
      content: encryptedContent,
      recipients: recipients.split(',').map(r => r.trim()).filter(r => r),
      unlockDate: unlockDate || undefined,
      status: 'scheduled',
      attachments: attachmentUrls,
      type: leakType,
      options: { burnOnRead }
    };

    // Use async API to get XP reward
    try {
      const result = await storage.saveLetterAsync(letter);
      
      // Track analytics
      analytics.trackLetterCreated(letter.id, letter.type);
      
      // Check if we got XP from API response
      if (result && result.xp) {
        // Update quest progress
        const { dailyQuestsAPI } = await import('../utils/api');
        dailyQuestsAPI.updateProgress('create_letter').catch(() => {});
        
        // Trigger quest refresh event for DailyQuests component
        window.dispatchEvent(new CustomEvent('questProgressUpdated'));
        
        // Get current profile to check for level up (single request)
        const profile = await storage.getUserProfileAsync();
        const oldLevel = calculateLevel(profile.experience || 0);
        const newLevel = calculateLevel((profile.experience || 0) + result.xp);
        const levelUp = newLevel > oldLevel;
        
        if (levelUp) {
          analytics.trackLevelUp(newLevel);
        }
        
        setXpNotification({ xp: result.xp, level: levelUp ? newLevel : undefined, levelUp });
      }
    } catch (error) {
      // Fallback to local save
      storage.saveLetter(letter);
      analytics.trackError('letter_save_failed', letter.id);
    }

    storage.clearDraft();
  };

  const handleAnimationComplete = () => {
    setIsSending(false);
    navigate('/letters');
  };

  // MainButton (Telegram SEND) — listens for pressf:send-letter from App.tsx (stable subscription)
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  useEffect(() => {
    const handler = () => handleSaveRef.current();
    window.addEventListener('pressf:send-letter', handler);
    return () => window.removeEventListener('pressf:send-letter', handler);
  }, []);

  // --- Presets Logic ---
  const applyPreset = (preset: Preset) => {
      setLeakType(preset);
      // Optional: autofill generic titles based on preset
      if (!title) {
          if (preset === 'crypto') setTitle('🔑 Wallet Seeds (DO NOT SHARE)');
          if (preset === 'love') setTitle('❤️ For my crush');
          if (preset === 'roast') setTitle('🔥 Why you are mid');
          if (preset === 'confession') setTitle('💀 My dark secret');
      }
  };

  const addRecipient = (contact: string) => {
    const segments = recipients.split(',');
    segments.pop(); 
    const newValue = segments.length > 0 
      ? `${segments.join(', ')}, ${contact}, ` 
      : `${contact}, `;
    setRecipients(newValue);
  };

  // --- Media Handlers ---
  const triggerFileInput = (type: 'image' | 'video') => {
    if (type === 'image') fileInputRef.current?.click();
    else videoInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const previewUrl = URL.createObjectURL(file);
      setAttachments(prev => [...prev, {
        id: Date.now().toString(),
        type,
        previewUrl,
        file
      }]);
    }
    e.target.value = '';
  };

  const toggleRecording = async () => {
    if (isRecording) {
      if (recordingInterval.current) clearInterval(recordingInterval.current);
      setIsRecording(false);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
        const mr = new MediaRecorder(stream);
        mediaRecorderRef.current = mr;
        audioChunksRef.current = [];
        mr.ondataavailable = (e) => { if (e.data.size) audioChunksRef.current.push(e.data); };
        mr.onstop = () => {
          stream.getTracks().forEach(t => t.stop());
          const blob = new Blob(audioChunksRef.current, { type: mime });
          if (blob.size > 0) {
            setAttachments(prev => [...prev, {
              id: Date.now().toString(),
              type: 'audio',
              previewUrl: URL.createObjectURL(blob),
              file: blob
            }]);
          }
        };
        mr.start();
        setIsRecording(true);
        setRecordingTime(0);
        recordingInterval.current = window.setInterval(() => setRecordingTime(prev => prev + 1), 1000);
      } catch (e) {
        console.error('Mic access failed:', e);
        tg.showPopup({ message: t('attach_voice') ? 'Microphone access required' : 'Нужен доступ к микрофону' });
      }
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="pb-content-bottom relative min-h-screen">
      <EnvelopeAnimation isVisible={isSending} onComplete={handleAnimationComplete} />
      {xpNotification && (
        <XPNotification
          xp={xpNotification.xp}
          level={xpNotification.level}
          levelUp={xpNotification.levelUp || false}
          onComplete={() => setXpNotification(null)}
        />
      )}
      
      {/* Security Overlay */}
      <AnimatePresence>
        {encryptionStep > 0 && !isSending && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center font-mono text-accent-cyan"
          >
             {encryptionStep === 1 && (
                 <>
                    <Lock size={64} className="mb-4 animate-pulse motion-reduce:animate-none text-accent-cyan" />
                    <p className="text-xs tracking-widest font-bold mb-2">{t('encrypting')}</p>
                 </>
             )}

             {encryptionStep === 2 && (
                 <div className="flex flex-col items-center">
                    <div className="relative w-20 h-20 mb-8">
                        {/* Key Splitting Animation */}
                        <motion.div 
                            initial={{ scale: 1 }}
                            animate={{ scale: 0, opacity: 0 }}
                            transition={{ duration: 0.5 }}
                            className="absolute inset-0 flex items-center justify-center"
                        >
                            <Key size={48} className="text-accent-gold" />
                        </motion.div>
                        
                        {/* Shards flying out */}
                        {[0, 1, 2].map(i => (
                            <motion.div
                                key={i}
                                initial={{ x: 0, y: 0, opacity: 0 }}
                                animate={{ 
                                    x: i === 0 ? -60 : i === 1 ? 60 : 0, 
                                    y: i === 2 ? 60 : -40, 
                                    opacity: 1 
                                }}
                                transition={{ delay: 0.4, duration: 0.5 }}
                                className="absolute inset-0 flex items-center justify-center"
                            >
                                <div className="p-2 bg-accent-gold/20 border border-accent-gold rounded-full">
                                    <Key size={16} className="text-accent-gold" />
                                </div>
                            </motion.div>
                        ))}
                    </div>
                    <p className="text-xs tracking-widest font-bold text-accent-gold">SHAMIR PROTOCOL: SPLITTING KEYS</p>
                 </div>
             )}

             {encryptionStep === 3 && (
                 <>
                    <Network size={64} className="mb-4 animate-pulse text-purple-500" />
                    <p className="text-xs tracking-widest font-bold text-purple-500">{t('uploading')}</p>
                 </>
             )}

             <div className="w-64 h-1 bg-gray-800 rounded-full mt-6 overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 3.5, ease: "linear" }}
                  className={`h-full shadow-[0_0_15px_currentColor] ${
                      encryptionStep === 2 ? 'bg-accent-gold' : encryptionStep === 3 ? 'bg-purple-500' : 'bg-accent-cyan'
                  }`}
                />
             </div>
             
             <div className="mt-4 text-xs text-muted opacity-50 text-left w-64 h-24 overflow-hidden font-mono">
                {encryptionStep === 1 && `> ${t('log_aes_init')}\n> ${t('log_salt_gen')}`}
                {encryptionStep === 2 && `> ${t('log_shards')}\n> ${t('log_distribute')}`}
                {encryptionStep === 3 && `> ${t('log_securing')}\n> ${t('log_commit')}`}
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={(e) => handleFileChange(e, 'image')} />
      <input type="file" accept="video/*" ref={videoInputRef} className="hidden" onChange={(e) => handleFileChange(e, 'video')} />

      {/* Draft Notification */}
      <AnimatePresence>
        {hasDraft && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-accent-cyan/10 border-b border-accent-cyan/30 overflow-hidden mb-4 rounded-xl"
          >
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Save size={20} className="text-accent-cyan" />
                <div>
                  <h4 className="font-bold text-sm text-accent-cyan">{t('draft_found')}</h4>
                  <p className="text-xs text-muted">{t('draft_desc')}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleRestoreDraft} className="px-3 py-1.5 bg-accent-cyan text-black text-xs font-bold rounded hover:bg-cyan-400 transition-colors">{t('restore_draft')}</button>
                <button onClick={handleDiscardDraft} className="px-3 py-1.5 bg-card border border-border text-muted hover:text-red-400 text-xs font-bold rounded transition-colors">{t('discard_draft')}</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex justify-between items-center mb-4">
        <h1 className="font-heading text-2xl font-black uppercase tracking-widest flex items-center gap-2 text-accent-cyan drop-shadow-[0_0_10px_rgba(0,224,255,0.8)]">
            <Terminal size={24} className="text-accent-cyan" /> 
            {t('new_letter')}
        </h1>
        <div className="flex items-center gap-2">
          <InfoSection title={t('new_letter')} description={t('help_create_letter')} id="create_letter_help" autoOpen />
          <button onClick={() => navigate(-1)} className="p-2 bg-input rounded-full text-primary hover:bg-input/80 transition-colors">
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Presets Selector */}
      <div className="mb-6 overflow-x-auto pb-2 scrollbar-hide">
         <div className="flex gap-3">
            {[
                { id: 'crypto', icon: Key, color: 'text-accent-gold', bg: 'bg-accent-gold/10', border: 'border-accent-gold/30' },
                { id: 'love', icon: Heart, color: 'text-accent-pink', bg: 'bg-accent-pink/10', border: 'border-accent-pink/30' },
                { id: 'roast', icon: Flame, color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30' },
                { id: 'confession', icon: Skull, color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/30' }
            ].map((p) => (
                <motion.button
                    key={p.id}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => applyPreset(p.id as Preset)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all whitespace-nowrap ${
                        leakType === p.id 
                            ? `${p.bg} ${p.border} ${p.color} shadow-[0_0_15px_rgba(0,0,0,0.2)]` 
                            : 'bg-card border-border text-muted opacity-60 hover:opacity-100'
                    }`}
                >
                    <p.icon size={16} />
                    <span className="text-xs font-bold uppercase">{t(`preset_${p.id}` as any)}</span>
                </motion.button>
            ))}
         </div>
      </div>

      <div className="space-y-4">
        {/* Title Input */}
        <div className="min-w-0">
          <label className="label-terminal text-xs text-muted font-bold tracking-wider ml-1 block mb-1">{t('title_label')}</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="input-terminal w-full max-w-full bg-card border border-border rounded-lg rounded-l-none p-4 text-primary outline-none transition-all placeholder:text-muted/50 font-medium box-border"
            placeholder={t('placeholder_title')}
          />
        </div>

        {/* Recipients Input (Clean, no fake suggestions) */}
        <div className="relative min-w-0">
          <label className="label-terminal text-xs text-muted font-bold tracking-wider ml-1 block mb-1">{t('recipients_label')}</label>
          <div className="relative min-w-0">
             <input
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              className="input-terminal w-full max-w-full bg-card border border-border rounded-lg rounded-l-none p-4 text-primary outline-none transition-all placeholder:text-muted/50 box-border"
              placeholder={t('placeholder_recipients')}
            />
            <div className={`absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-muted/30`}>
              <AtSign size={18} />
            </div>
          </div>
        </div>

        {/* Content Textarea */}
        <div className="min-w-0">
          <label className="label-terminal text-xs text-muted font-bold tracking-wider ml-1 block mb-1">{t('content_label')}</label>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            className="input-terminal w-full max-w-full h-32 bg-card border border-border rounded-lg rounded-l-none p-4 text-primary outline-none transition-all resize-none placeholder:text-muted/50 text-sm box-border"
            placeholder={t('placeholder_content')}
          />
        </div>

        {/* Unlock Date Input */}
        <div>
          <label className="label-terminal text-xs text-muted font-bold tracking-wider ml-1 block mb-1">{t('unlock_date_label')}</label>
          <div className="relative">
            <input
              type="date"
              value={unlockDate}
              onChange={e => setUnlockDate(e.target.value)}
              className="input-terminal w-full bg-card border border-border rounded-lg rounded-l-none p-4 text-primary outline-none transition-all placeholder:text-muted/50 [color-scheme:dark]"
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-muted/30">
              <Calendar size={18} />
            </div>
          </div>
        </div>

        {/* Settings / Options */}
        <div className="card-terminal bg-black/20 border border-white/5 rounded-xl p-4">
           <h4 className="label-terminal text-xs font-bold text-muted mb-3 flex items-center gap-2">
             <Shield size={14} /> {t('leak_options')}
           </h4>
           <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                 <div className={`p-2 rounded-lg ${burnOnRead ? 'bg-red-500/20 text-red-500' : 'bg-input text-muted'}`}>
                    <EyeOff size={18} />
                 </div>
                 <div>
                    <p className={`text-sm font-bold ${burnOnRead ? 'text-red-500' : 'text-primary'}`}>{t('opt_burn')}</p>
                    <p className="text-xs text-muted">{t('opt_burn_desc')}</p>
                 </div>
              </div>
              <div 
                onClick={() => setBurnOnRead(!burnOnRead)}
                className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${burnOnRead ? 'bg-red-500' : 'bg-input'}`}
              >
                <motion.div 
                  animate={{ x: burnOnRead ? 24 : 2 }}
                  className="absolute top-1 left-0 w-4 h-4 bg-white rounded-full shadow-md"
                />
              </div>
           </div>
        </div>

        {/* Attachments List */}
        <AnimatePresence>
          {attachments.length > 0 && (
            <div className="grid grid-cols-4 gap-2 mb-2">
              {attachments.map((att) => (
                <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0 }} key={att.id} className="relative aspect-square bg-input rounded-xl overflow-hidden border border-border group">
                  {att.type === 'image' && <img src={att.previewUrl} alt="attachment" className="w-full h-full object-cover" />}
                  {att.type === 'video' && <div className="w-full h-full flex items-center justify-center bg-black/50"><Video size={24} className="text-white" /></div>}
                  {att.type === 'audio' && <div className="w-full h-full flex flex-col items-center justify-center bg-accent-lime/10"><FileAudio size={24} className="text-accent-lime" /></div>}
                  <button onClick={() => removeAttachment(att.id)} className="absolute top-1 right-1 p-1 bg-red-500 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"><X size={12} /></button>
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>

        {/* Media Buttons */}
        <div className="flex gap-2">
          <button onClick={() => triggerFileInput('image')} className="flex-1 py-3 bg-card rounded-xl flex flex-col gap-1 justify-center items-center text-accent-cyan border border-border hover:bg-accent-cyan/10 transition-all active:scale-95">
            <ImageIcon size={22} /><span className="text-xs font-bold uppercase">{t('attach_photo')}</span>
          </button>
          <button onClick={() => triggerFileInput('video')} className="flex-1 py-3 bg-card rounded-xl flex flex-col gap-1 justify-center items-center text-accent-pink border border-border hover:bg-accent-pink/10 transition-all active:scale-95">
            <Video size={22} /><span className="text-xs font-bold uppercase">{t('attach_video')}</span>
          </button>
          <button onClick={toggleRecording} className={`flex-1 py-3 rounded-xl flex flex-col gap-1 justify-center items-center border transition-all active:scale-95 ${isRecording ? 'bg-red-500/20 border-red-500 text-red-500 animate-pulse' : 'bg-card border-border text-accent-lime hover:bg-accent-lime/10'}`}>
            {isRecording ? <StopCircle size={22} /> : <Mic size={22} />}
            <span className="text-xs font-bold uppercase whitespace-nowrap">{isRecording ? formatTime(recordingTime) : t('attach_voice')}</span>
          </button>
        </div>

        {/* Save/Send Button */}
        <button 
          onClick={handleSave}
          className={`w-full py-4 mt-8 rounded-xl font-black text-lg uppercase tracking-wide shadow-lg transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-accent-cyan to-blue-600 text-white shadow-[0_0_20px_rgba(0,224,255,0.3)] hover:shadow-[0_0_30px_rgba(0,224,255,0.5)] active:scale-95`}
        >
          <Lock size={20} />
          {t('seal_btn')}
        </button>
      </div>
    </div>
  );
};

export default CreateLetter;
