import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Users, Calendar, Award, Play, Clock, CheckCircle, XCircle } from 'lucide-react';
import { tournamentsAPI } from '../utils/api';
import { useTranslation } from '../contexts/LanguageContext';
import LoadingState from './LoadingState';
import { Tournament, TournamentParticipant } from '../types';
import { tg } from '../utils/telegram';
import { playSound } from '../utils/sound';

const Tournaments: React.FC = () => {
  const { t } = useTranslation();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'active' | 'past'>('upcoming');
  const [registering, setRegistering] = useState<string | null>(null);

  useEffect(() => {
    loadTournaments();
  }, [activeTab]);

  const loadTournaments = async () => {
    try {
      setLoading(true);
      const status = activeTab === 'past' ? 'past' : activeTab === 'active' ? 'active' : 'upcoming';
      const result = await tournamentsAPI.getAll(status);
      if (result.ok && result.data?.tournaments) {
        setTournaments(result.data.tournaments);
      }
    } catch (error) {
      console.error('Failed to load tournaments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (tournamentId: string) => {
    playSound('click');
    setRegistering(tournamentId);

    try {
      const result = await tournamentsAPI.register(tournamentId);
      if (result.ok) {
        playSound('success');
        tg.showPopup({ message: t('tournament_registered') || 'Successfully registered!' });
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        await loadTournaments();
      } else {
        throw new Error(result.error || 'Failed to register');
      }
    } catch (error: any) {
      playSound('error');
      tg.showPopup({ message: error.message || t('tournament_register_failed') || 'Failed to register' });
      if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
    } finally {
      setRegistering(null);
    }
  };

  const getTimeUntil = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    
    if (diff <= 0) return null;

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const canRegister = (tournament: Tournament) => {
    if (tournament.isRegistered) return false;
    const now = new Date();
    const regStart = new Date(tournament.registrationStart);
    const regEnd = new Date(tournament.registrationEnd);
    return now >= regStart && now <= regEnd && (tournament.participantCount || 0) < tournament.maxParticipants;
  };

  if (loading) {
    return (
      <LoadingState
        terminal
        message={t('loading') || 'Loading...'}
        className="py-8 min-h-0"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Trophy size={18} className="text-accent-gold" />
        <h3 className="font-heading text-xs font-black uppercase tracking-wider text-purple-400">
          {t('tournaments') || 'TOURNAMENTS'}
        </h3>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {(['upcoming', 'active', 'past'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              playSound('click');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === tab
                ? 'bg-gradient-to-r from-purple-500 to-accent-cyan text-white'
                : 'bg-card border border-border text-muted hover:border-purple-500/50'
            }`}
          >
            {t(`tournament_tab_${tab}`) || tab}
          </button>
        ))}
      </div>

      {/* Tournaments List */}
      {tournaments.length === 0 ? (
        <div className="text-center py-8 text-muted text-xs">
          {t('no_tournaments') || 'No tournaments available'}
        </div>
      ) : (
        <div className="space-y-3">
          {tournaments.map((tournament) => (
            <motion.div
              key={tournament.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card border border-purple-500/30 rounded-xl p-4 space-y-3"
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 flex-1">
                  {tournament.icon && <span className="text-2xl">{tournament.icon}</span>}
                  <div className="flex-1">
                    <h4 className="font-heading text-sm font-black text-white">{tournament.name}</h4>
                    {tournament.description && (
                      <p className="text-xs text-muted mt-1">{tournament.description}</p>
                    )}
                  </div>
                </div>
                {tournament.isRegistered && (
                  <div className="flex items-center gap-1 text-xs text-accent-lime">
                    <CheckCircle size={12} />
                    {t('registered') || 'Registered'}
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1 text-muted">
                  <Users size={12} />
                  {tournament.participantCount || 0}/{tournament.maxParticipants}
                </div>
                <div className="flex items-center gap-1 text-muted">
                  <Calendar size={12} />
                  {new Date(tournament.startDate).toLocaleDateString()}
                </div>
                {tournament.prizePool && Object.keys(tournament.prizePool).length > 0 && (
                  <div className="flex items-center gap-1 text-accent-gold col-span-2">
                    <Award size={12} />
                    {t('prize_pool') || 'Prize Pool'}: {Object.values(tournament.prizePool)[0]}
                  </div>
                )}
              </div>

              {/* Status & Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-border/30">
                <div className="flex items-center gap-1 text-xs text-muted">
                  {tournament.status === 'registration' && (
                    <>
                      <Clock size={12} />
                      {getTimeUntil(tournament.registrationEnd) && (
                        <span>{t('registration_ends_in') || 'Registration ends in'} {getTimeUntil(tournament.registrationEnd)}</span>
                      )}
                    </>
                  )}
                  {tournament.status === 'active' && (
                    <span className="text-accent-lime">{t('in_progress') || 'In Progress'}</span>
                  )}
                  {tournament.status === 'completed' && (
                    <span className="text-muted">{t('completed') || 'Completed'}</span>
                  )}
                </div>

                {canRegister(tournament) && (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleRegister(tournament.id)}
                    disabled={registering === tournament.id}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-purple-500 to-accent-cyan text-white disabled:opacity-50"
                  >
                    {registering === tournament.id ? (t('registering') || 'Registering...') : (t('register') || 'REGISTER')}
                  </motion.button>
                )}

                {tournament.isRegistered && tournament.status === 'active' && (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      playSound('click');
                      // Navigate to tournament details
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-accent-cyan text-black"
                  >
                    {t('view') || 'VIEW'}
                  </motion.button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Tournaments;
