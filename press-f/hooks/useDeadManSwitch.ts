import { useState, useEffect } from 'react';
import { storage } from '../utils/storage';

export const useDeadManSwitch = () => {
  const [daysRemaining, setDaysRemaining] = useState<number>(0);
  const [isDead, setIsDead] = useState<boolean>(false);

  const checkStatus = () => {
    const settings = storage.getSettings();
    const now = Date.now();
    const deadline = settings.lastCheckIn + (settings.deadManSwitchDays * 24 * 60 * 60 * 1000);
    
    const diff = deadline - now;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    setDaysRemaining(days);
    setIsDead(diff <= 0);
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 60000); // check every minute
    return () => clearInterval(interval);
  }, []);

  const imAlive = () => {
    storage.updateSettings({ lastCheckIn: Date.now() });
    checkStatus();
  };

  return { daysRemaining, isDead, imAlive };
};