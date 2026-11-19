import React from 'react';
import { SyncMetrics, formatTimeMs, evaluateSyncHealthTag } from '@echocast/shared';
import { Clock, Zap, Activity } from 'lucide-react';

interface Props {
  metrics: SyncMetrics;
  syncErrorMs?: number;
  compact?: boolean;
}

export const SyncMetricsBadge: React.FC<Props> = ({ metrics, syncErrorMs, compact = false }) => {
  const qualityConfig = {
    excellent: {
      color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      dot: 'bg-emerald-500',
      label: 'Sub-5ms Sync (Excellent)',
    },
    good: {
      color: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
      dot: 'bg-teal-500',
      label: 'Sub-15ms Sync (Good)',
    },
    fair: {
      color: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      dot: 'bg-amber-500',
      label: 'Fair Sync (15–35ms)',
    },
    poor: {
      color: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      dot: 'bg-rose-500',
      label: 'Sync Calibrating...',
    },
    uncalibrated: {
      color: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
      dot: 'bg-slate-500',
      label: 'Calibrating Clock',
    },
  };

  const current = qualityConfig[metrics.quality] || qualityConfig.uncalibrated;
  const healthTag = evaluateSyncHealthTag(syncErrorMs);

  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${current.color}`}
        title={`Offset: ${formatTimeMs(metrics.clockOffsetMs)}, RTT: ${formatTimeMs(metrics.roundTripTimeMs)}`}
      >
        <span className={`w-2 h-2 rounded-full animate-pulse ${current.dot}`} />
        <span>{formatTimeMs(metrics.clockOffsetMs)}</span>
        {syncErrorMs !== undefined && (
          <span className="font-mono text-[10px] opacity-80">
            ({syncErrorMs > 0 ? '+' : ''}{syncErrorMs}ms)
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border bg-charcoal-850 border-charcoal-750 ${current.color}`}>
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full animate-pulse ${current.dot}`} />
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider block">{current.label}</span>
            {syncErrorMs !== undefined && (
              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded border ${healthTag.badgeClass}`}>
                {healthTag.label}
              </span>
            )}
          </div>
          <span className="text-[11px] opacity-80 font-mono">
            RTT: {formatTimeMs(metrics.roundTripTimeMs)} | Jitter: ±{formatTimeMs(metrics.jitterMs)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs font-mono font-medium flex-wrap">
        {syncErrorMs !== undefined && (
          <div className="flex items-center gap-1" title="Measured playback phase deviation from sender">
            <Activity className="w-3.5 h-3.5 text-cyanAccent-400" />
            <span className="text-cyanAccent-300 font-bold">
              Deviation: {syncErrorMs > 0 ? '+' : ''}{syncErrorMs}ms
            </span>
          </div>
        )}
        <div className="flex items-center gap-1" title="Clock Offset from Sender/Server">
          <Clock className="w-3.5 h-3.5 opacity-70" />
          <span>Offset: {formatTimeMs(metrics.clockOffsetMs)}</span>
        </div>
        <div className="flex items-center gap-1" title="Total Effective Latency Compensation">
          <Zap className="w-3.5 h-3.5 opacity-70" />
          <span>Latency: {formatTimeMs(metrics.effectiveTotalLatencyMs)}</span>
        </div>
      </div>
    </div>
  );
};
