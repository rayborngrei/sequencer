import { useRef, useEffect } from 'react';
import { audioEngine } from './audioEngine';

interface VisualizerProps {
  isPlaying: boolean;
}

export default function Visualizer({ isPlaying }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;

      if (width === 0 || height === 0) {
        animFrameRef.current = requestAnimationFrame(draw);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      if (isPlaying && audioEngine.isReady) {
        const data = audioEngine.getAnalyserData();
        if (data && data.length > 0) {
          const bufferLength = data.length;
          const barWidth = (width / bufferLength) * 2;

          let x = 0;
          for (let i = 0; i < bufferLength; i++) {
            const value = data[i] || 0;
            const barHeight = (value / 255) * height;

            // Muted steel-blue to slate gradient
            const hue = 210 + (i / bufferLength) * 30;
            const saturation = 20 + (value / 255) * 30;
            const lightness = 40 + (value / 255) * 30;
            ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${0.4 + (value / 255) * 0.6})`;
            ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);

            x += barWidth;
            if (x > width) break;
          }
        }
      } else {
        // Idle animation — muted gray wave
        const time = Date.now() / 1000;
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
        ctx.lineWidth = 2;

        for (let x = 0; x < width; x++) {
          const y = height / 2 + Math.sin(x * 0.02 + time * 2) * 5 + Math.sin(x * 0.01 + time) * 3;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      animFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={40}
      className="rounded-lg bg-gray-900/50 border border-gray-800/50"
    />
  );
}
