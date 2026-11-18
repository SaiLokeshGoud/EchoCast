import React from 'react';
import { Volume2, Sparkles } from 'lucide-react';

interface Props {
  isUnlocked: boolean;
  onUnlock: () => Promise<boolean>;
}

export const AudioUnlockModal: React.FC<Props> = ({ isUnlocked, onUnlock }) => {
  if (isUnlocked) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-40 max-w-md mx-auto animate-in slide-in-from-bottom duration-300">
      <div className="bg-charcoal-900 text-white p-4 rounded-2xl shadow-2xl border border-brand-500/40 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-charcoal-850 border border-charcoal-700 flex items-center justify-center shrink-0 text-brand-400">
            <Volume2 className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>Enable Audio Hardware</span>
              <Sparkles className="w-3.5 h-3.5 text-brand-400" />
            </h4>
            <p className="text-[11px] text-slate-400">
              Mobile browsers require a tap to activate hardware audio.
            </p>
          </div>
        </div>

        <button
          onClick={() => onUnlock()}
          className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-charcoal-950 font-bold text-xs rounded-xl shadow-md transition active:scale-95 shrink-0"
        >
          Activate
        </button>
      </div>
    </div>
  );
};
