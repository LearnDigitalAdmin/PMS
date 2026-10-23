import React from 'react';

/**
 * A money figure for big-number tiles: the amount at the surrounding font size, with a small "KES" label in front.
 * A plain "KES 125,000" at text-2xl is wider than the "$125,000" these tiles were designed for and overflows on phones.
 */
const Money: React.FC<{ value: number | null | undefined; className?: string }> = ({ value, className }) => {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  return (
    <span className={`whitespace-nowrap ${className ?? ''}`}>
      {safe < 0 ? '-' : ''}
      <span className="mr-1 text-[0.55em] font-semibold uppercase tracking-wide opacity-70">KES</span>
      {Math.abs(safe).toLocaleString('en-KE', { maximumFractionDigits: 2 })}
    </span>
  );
};

export default Money;
