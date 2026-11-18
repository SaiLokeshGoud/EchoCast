import React, { useEffect, useRef } from 'react';
import { webAudioEngine } from '../../core/audio/webAudioEngine';

interface Props {
  isActive?: boolean;
  barCount?: number;
  height?: number;
}

export const AudioVisualizer: React.FC<Props> = ({ isActive = true, barCount = 32, height = 56 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const bufferLength = 64;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      animId = requestAnimationFrame(render);

      const width = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, width, h);

      if (isActive && webAudioEngine.getState() === 'playing') {
        webAudioEngine.getFrequencyData(dataArray);
      } else {
        // Idle gentle pulse animation when paused or idle
        for (let i = 0; i < dataArray.length; i++) {
          dataArray[i] = Math.max(0, dataArray[i] * 0.9);
        }
      }

      const totalBars = Math.min(barCount, bufferLength);
      const gap = 3;
      const barWidth = Math.max(2, (width - gap * (totalBars - 1)) / totalBars);

      for (let i = 0; i < totalBars; i++) {
        // Use logarithmic-like distribution to emphasize bass and midrange
        const dataIndex = Math.min(bufferLength - 1, Math.floor(Math.pow(i / totalBars, 1.4) * bufferLength));
        const value = dataArray[dataIndex] || 0;
        const percent = value / 255;
        const barHeight = Math.max(3, percent * (h - 4));

        const x = i * (barWidth + gap);
        const y = h - barHeight;

        // Gradient for bars (cyan to vibrant indigo/purple)
        const gradient = ctx.createLinearGradient(0, h, 0, 0);
        gradient.addColorStop(0, '#4f46e5');
        gradient.addColorStop(0.7, '#6366f1');
        gradient.addColorStop(1, '#38bdf8');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        // Rounded top bars
        const radius = Math.min(barWidth / 2, 2);
        ctx.roundRect(x, y, barWidth, barHeight, [radius, radius, 0, 0]);
        ctx.fill();
      }
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isActive, barCount]);

  return (
    <div className="w-full flex items-center justify-center bg-slate-950/60 rounded-xl p-2 border border-slate-800/80 shadow-inner">
      <canvas
        ref={canvasRef}
        width={380}
        height={height}
        className="w-full max-w-md h-14 block"
      />
    </div>
  );
};
