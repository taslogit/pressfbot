import React from 'react';

interface ListSkeletonProps {
  rows?: number;
  className?: string;
}

/** Скелетон списка: пульсирующие строки в стиле карточек. */
const ListSkeleton: React.FC<ListSkeletonProps> = ({ rows = 5, className = '' }) => {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="card-terminal bg-black/40 border border-border rounded-xl p-4 animate-pulse motion-reduce:animate-none"
          role="presentation"
          aria-hidden="true"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex-shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="h-4 w-2/3 bg-white/10 rounded" />
              <div className="h-3 w-5/6 bg-white/5 rounded" />
            </div>
            <div className="h-4 w-12 bg-white/10 rounded flex-shrink-0" />
          </div>
        </div>
      ))}
    </div>
  );
};

export default ListSkeleton;
