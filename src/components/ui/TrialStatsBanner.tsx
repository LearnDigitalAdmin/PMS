import React from 'react';
import { FileText, MessageSquare, DollarSign, Users, Clock } from 'lucide-react';
import { useTrialStats } from '../../hooks/useTrialStats';
import { formatCurrencyCompact, formatNumber } from '../../utils/FormatUtils';

interface TrialStatsBannerProps {
  userId: number | string | undefined;
  /** Trim padding/text size for tight header spots (e.g. under a page title). Defaults to full size. */
  compact?: boolean;
  className?: string;
}

/**
 * Shows the free-trial "hook" stats — invoices sent, SMS sent, amount
 * collected, total tenants, and days remaining — wherever it's mounted.
 * Renders nothing outside of an active trial, so it's safe to drop into
 * every page's header without extra conditionals at the call site.
 */
const TrialStatsBanner: React.FC<TrialStatsBannerProps> = ({ userId, compact = false, className = '' }) => {
  const { stats, loading } = useTrialStats(userId);

  if (!stats.isTrial) return null;

  const items = [
    { icon: FileText, label: 'Invoices sent', value: formatNumber(stats.totalInvoices) },
    { icon: MessageSquare, label: 'SMS sent', value: formatNumber(stats.totalSmsSent) },
    { icon: DollarSign, label: 'Collected', value: formatCurrencyCompact(stats.amountCollected) },
    { icon: Users, label: 'Tenants', value: formatNumber(stats.totalTenants) },
  ];

  const daysLabel =
    stats.daysRemaining === null
      ? '—'
      : stats.daysRemaining === 0
      ? 'Ends today'
      : `${stats.daysRemaining} day${stats.daysRemaining === 1 ? '' : 's'}`;

  const urgent = stats.daysRemaining !== null && stats.daysRemaining <= 7;

  return (
    <div
      className={`rounded-xl bg-gradient-to-r from-indigo-600 via-blue-600 to-purple-600 text-white shadow-md overflow-hidden ${className}`}
    >
      <div
        className={`flex items-center gap-4 md:gap-6 overflow-x-auto no-scrollbar ${
          compact ? 'px-3 py-2' : 'px-4 py-3'
        }`}
      >
        <div className="flex items-center gap-2 pr-4 border-r border-white/25 flex-shrink-0">
          <span className={`font-bold uppercase tracking-wide bg-white/15 rounded-full px-2 py-0.5 ${compact ? 'text-[10px]' : 'text-xs'}`}>
            Free trial
          </span>
        </div>

        {items.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-2 flex-shrink-0">
            <Icon className={compact ? 'w-3.5 h-3.5 opacity-80' : 'w-4 h-4 opacity-80'} />
            <div className="leading-tight">
              <div className={`font-bold ${compact ? 'text-sm' : 'text-base'}`}>
                {loading ? '—' : value}
              </div>
              <div className={`opacity-75 whitespace-nowrap ${compact ? 'text-[10px]' : 'text-xs'}`}>{label}</div>
            </div>
          </div>
        ))}

        <div
          className={`flex items-center gap-2 flex-shrink-0 ml-auto pl-4 border-l border-white/25 rounded-lg ${
            urgent ? 'bg-red-500/25' : ''
          } ${compact ? 'px-2 py-0.5' : 'px-3 py-1'}`}
        >
          <Clock className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
          <div className="leading-tight">
            <div className={`font-bold ${compact ? 'text-sm' : 'text-base'}`}>{loading ? '—' : daysLabel}</div>
            <div className={`opacity-75 whitespace-nowrap ${compact ? 'text-[10px]' : 'text-xs'}`}>left on trial</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrialStatsBanner;
