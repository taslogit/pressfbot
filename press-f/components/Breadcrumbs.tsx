import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';
import { useBreadcrumb } from '../contexts/BreadcrumbContext';

export type BreadcrumbSegment = { path?: string; labelKey: string };

interface BreadcrumbsProps {
  /** Override segments (e.g. Store → Stars). If not set, from context or pathname. */
  segments?: BreadcrumbSegment[] | null;
  className?: string;
}

const PATH_TO_LABEL: Record<string, string> = {
  '/': 'nav_home',
  '/letters': 'nav_letters',
  '/store': 'nav_store',
  '/profile': 'nav_profile',
  '/settings': 'settings_title',
  '/wiki': 'wiki_title',
  '/duels': 'nav_duels',
  '/search': 'nav_search',
  '/notifications': 'notifications_title',
  '/create-letter': 'new_letter',
  '/squads': 'wiki_topic_squads',
  '/witness-approval': 'witness_protocol',
  '/funeral-dj': 'funeral_dj',
  '/share': 'share_post_title',
  '/resurrection': 'resurrection_protocol',
};

function getSegmentsFromPath(pathname: string): BreadcrumbSegment[] {
  const key = PATH_TO_LABEL[pathname];
  if (key) return [{ labelKey: key }];
  if (pathname.startsWith('/letters/')) return [{ path: '/letters', labelKey: 'nav_letters' }, { labelKey: 'your_letters' }];
  if (pathname.startsWith('/duels/')) return [{ path: '/duels', labelKey: 'nav_duels' }, { labelKey: 'meme_duels' }];
  return [];
}

export default function Breadcrumbs({ segments: propSegments, className = '' }: BreadcrumbsProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const ctx = useBreadcrumb();
  const segments = propSegments !== undefined
    ? propSegments
    : (ctx?.segments ?? getSegmentsFromPath(location.pathname));
  if (!segments || segments.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={`flex items-center gap-1 text-xs text-muted flex-wrap ${className}`}>
      {segments.map((seg, i) => {
        const label = t(seg.labelKey as any) !== seg.labelKey ? t(seg.labelKey as any) : seg.labelKey;
        const isLast = i === segments.length - 1;
        return (
          <React.Fragment key={i}>
            {i > 0 && <ChevronRight size={12} className="text-muted/70 flex-shrink-0" aria-hidden />}
            {seg.path && !isLast ? (
              <button
                type="button"
                onClick={() => navigate(seg.path!)}
                className="hover:text-primary transition-colors truncate max-w-[120px]"
              >
                {label}
              </button>
            ) : (
              <span className={isLast ? 'text-primary font-medium truncate max-w-[140px]' : 'truncate max-w-[120px]'}>
                {label}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
