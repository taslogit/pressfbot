import { useState, useEffect, useCallback } from 'react';
import { storage } from '../utils/storage';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MS_PER_HOUR = 1000 * 60 * 60;

export type DeadManSwitchOverride = {
  deadManSwitchDays?: number;
  lastCheckIn?: number;
};

/** Pass override to use the selected protocol (24H/7D/30D) for countdown; otherwise reads from storage. */
export const useDeadManSwitch = (override?: DeadManSwitchOverride | null) => {
  const [daysRemaining, setDaysRemaining] = useState<number>(0);
  const [hoursRemaining, setHoursRemaining] = useState<number>(0);
  const [is24hMode, setIs24hMode] = useState<boolean>(false);
  const [isDead, setIsDead] = useState<boolean>(false);

  const checkStatus = useCallback(() => {
    const settings = storage.getSettings();
    const now = Date.now();
    const daysSetting = override?.deadManSwitchDays ?? settings.deadManSwitchDays ?? 7;
    const lastCheckIn = override?.lastCheckIn ?? settings.lastCheckIn ?? now;
    const deadline = lastCheckIn + (daysSetting * MS_PER_DAY);
    const diff = deadline - now;

    setIs24hMode(daysSetting === 1);
    if (daysSetting === 1) {
      setHoursRemaining(Math.max(0, Math.ceil(diff / MS_PER_HOUR)));
      setDaysRemaining(diff <= 0 ? 0 : 1);
    } else {
      setDaysRemaining(Math.max(0, Math.ceil(diff / MS_PER_DAY)));
      setHoursRemaining(0);
    }
    setIsDead(diff <= 0);
  }, [override?.deadManSwitchDays, override?.lastCheckIn]);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 60000); // check every minute
    return () => clearInterval(interval);
  }, [checkStatus]);

  const imAlive = useCallback(() => {
    storage.updateSettings({ lastCheckIn: Date.now() });
    checkStatus();
  }, [checkStatus]);

  return { daysRemaining, hoursRemaining, is24hMode, isDead, imAlive };
};