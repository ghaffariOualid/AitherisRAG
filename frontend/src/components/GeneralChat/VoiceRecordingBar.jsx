import React from 'react';
import { LuX, LuLoader2, LuAlertCircle, LuCheck } from 'react-icons/lu';

/**
 * Formats seconds into MM:SS format.
 */
const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Visual waveform bar component matching RAGio's Indigo / Violet design system.
 * Generates an elegant, symmetrical audio equalizer wave responding to speech volume.
 */
const WaveformBars = ({ audioLevel }) => {
  // Symmetrical weights simulating a studio audio spectrum
  const weights = [
    0.20, 0.32, 0.45, 0.62, 0.78, 0.90, 0.98, 0.85, 0.75, 0.92, 1.00, 0.88,
    0.88, 1.00, 0.92, 0.75, 0.85, 0.98, 0.90, 0.78, 0.62, 0.45, 0.32, 0.20,
  ];

  return (
    <div className="flex items-center justify-center gap-[3px] h-8 px-2 max-w-[260px] sm:max-w-[340px] w-full">
      {weights.map((weight, idx) => {
        // Base minimum height 4px, maximum 28px
        const factor = Math.max(0.12, (audioLevel / 100) * weight);
        const heightPx = Math.round(4 + factor * 24);
        const isPeak = heightPx > 16;

        return (
          <span
            key={idx}
            className={`w-[3px] rounded-full transition-all duration-100 ${
              isPeak
                ? 'bg-gradient-to-t from-indigo-600 via-indigo-500 to-purple-500 shadow-sm shadow-indigo-500/30'
                : 'bg-gradient-to-t from-indigo-500/80 to-indigo-400/80'
            }`}
            style={{
              height: `${heightPx}px`,
              opacity: Math.max(0.35, Math.min(1, 0.3 + (audioLevel / 100) * weight * 0.85)),
            }}
          />
        );
      })}
    </div>
  );
};

export const VoiceRecordingBar = ({
  isRecording,
  isTranscribing,
  recordingTime,
  audioLevel,
  error,
  onStop,
  onCancel,
  onClearError,
}) => {
  // Error state banner
  if (error && !isRecording && !isTranscribing) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-rose-50/90 border border-rose-200/80 rounded-2xl text-xs text-rose-700 animate-in fade-in slide-in-from-bottom-2 duration-200 shadow-sm">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <LuAlertCircle className="text-base text-rose-500 shrink-0" />
          <span className="truncate">{error}</span>
        </div>
        <button
          onClick={onClearError}
          className="p-1 hover:bg-rose-100 rounded-lg text-rose-500 transition-colors cursor-pointer"
          title="Fermer"
          aria-label="Fermer le message d'erreur"
        >
          <LuX className="text-sm" />
        </button>
      </div>
    );
  }

  // Transcribing state banner
  if (isTranscribing) {
    return (
      <div className="flex items-center justify-between gap-4 px-4 py-2.5 bg-gradient-to-r from-indigo-50/90 via-purple-50/70 to-indigo-50/90 border border-indigo-200/80 rounded-2xl shadow-sm animate-in fade-in duration-200">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-indigo-600/10 text-indigo-600 shadow-sm">
            <LuLoader2 className="text-lg animate-spin" />
          </div>
          <div>
            <div className="text-xs font-semibold text-indigo-900 flex items-center gap-1.5">
              <span>Transcription Whisper en cours...</span>
            </div>
            <p className="text-[11px] text-indigo-600/80">Conversion de votre voix en texte via l'IA</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 pr-2">
          <span className="inline-block w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
          <span className="inline-block w-2 h-2 rounded-full bg-indigo-500 animate-pulse delay-75" />
          <span className="inline-block w-2 h-2 rounded-full bg-purple-500 animate-pulse delay-150" />
        </div>
      </div>
    );
  }

  if (!isRecording) {
    return null;
  }

  // Active recording bar matching RAGio's Indigo & White UI
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 bg-gradient-to-r from-indigo-50/90 via-white to-purple-50/90 backdrop-blur-sm border border-indigo-200/80 rounded-2xl shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-200">
      {/* Live Badge & Recording Timer */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200/70 text-rose-600">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider">Direct</span>
        </div>
        <span className="text-xs font-mono font-semibold text-slate-700">
          {formatTime(recordingTime)}
        </span>
      </div>

      {/* RAGio Indigo Audio Waveform */}
      <div className="flex-1 flex justify-center min-w-0">
        <WaveformBars audioLevel={audioLevel} />
      </div>

      {/* Actions: Cancel (✕) & Terminer (✓) */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onCancel}
          type="button"
          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
          title="Annuler l'enregistrement"
          aria-label="Annuler l'enregistrement"
        >
          <LuX className="text-base" />
        </button>

        <button
          onClick={onStop}
          type="button"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-medium text-xs rounded-xl shadow-sm shadow-indigo-600/25 transition-all cursor-pointer"
          title="Terminer et transcrire"
          aria-label="Terminer l'enregistrement et transcrire"
        >
          <LuCheck className="text-sm stroke-[2.5]" />
          <span className="hidden sm:inline">Terminer</span>
        </button>
      </div>
    </div>
  );
};

export default VoiceRecordingBar;
