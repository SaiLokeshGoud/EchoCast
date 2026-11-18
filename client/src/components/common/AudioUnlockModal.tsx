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
      <div className="bg-gradient-to-r from-brand-600 to-indigo-700 text-white p-4 rounded-2xl shadow-2xl border border-brand-400/30 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0 animate-bounce">
            <Volume2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h4 className="text-sm font-bold flex items-center gap-1.5">
              <span>Enable Audio Output</span>
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            </h4>
            <p className="text-xs text-white/80">
              Browsers require a tap to activate high-precision hardware audio.
            </p>
          </div>
        </div>

        <button
          onClick={() => onUnlock()}
          className="px-4 py-2 bg-white text-brand-700 hover:bg-slate-100 font-bold text-xs rounded-xl shadow-lg transition active:scale-95 shrink-0"
        >
          Tap to Activate
        </button>
      </div>
    </div>
  );
};
