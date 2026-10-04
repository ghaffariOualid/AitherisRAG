import React, { useCallback } from 'react';
import { LuSend, LuMic, LuMicOff } from "react-icons/lu";
import AutoResizableTextarea from '../ui/AutoResizableTextarea';
import SkillSelector from './SkillSelector';
import VoiceRecordingBar from './VoiceRecordingBar';
import useAudioRecorder from '../../hooks/useAudioRecorder';

/**
 * Input component for GeneralChat with integrated SkillSelector and Whisper Voice Recording
 */
export const GeneralChatInput = React.memo(({
  question,
  setQuestion,
  isLoading,
  includedFilesCount,
  onSubmit,
  onKeyPress,
  documentName,
  skills = [],
  activeSkill = null,
  onSelectSkill = () => {},
}) => {
  const canSend = Boolean(documentName) || includedFilesCount > 0;

  // Handle transcribed text insertion
  const handleTranscriptionComplete = useCallback((transcribedText) => {
    if (!transcribedText) return;
    setQuestion((prev) => {
      const trimmed = (prev || '').trim();
      return trimmed ? `${trimmed} ${transcribedText}` : transcribedText;
    });
  }, [setQuestion]);

  // Audio recording hook
  const {
    isRecording,
    isTranscribing,
    recordingTime,
    audioLevel,
    error: recorderError,
    startRecording,
    stopRecording,
    cancelRecording,
    clearError,
  } = useAudioRecorder({
    onTranscriptionComplete: handleTranscriptionComplete,
  });

  const handleMicClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="border-t border-slate-100 bg-white/95 backdrop-blur-sm px-4 pt-2.5 pb-4 sm:px-6">
      <div className="mx-auto flex flex-col w-full max-w-3xl gap-2">
        {/* Top Bar: Skill Selector & Status */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-slate-400 hidden sm:inline">Règle d'analyse :</span>
            <SkillSelector
              skills={skills}
              activeSkill={activeSkill}
              onSelectSkill={onSelectSkill}
              disabled={isLoading || isRecording || isTranscribing}
            />
          </div>
          {includedFilesCount > 0 && !documentName && (
            <span className="text-[11px] text-slate-400 font-medium">
              {includedFilesCount} document{includedFilesCount > 1 ? 's' : ''} actif{includedFilesCount > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Voice Recording / Transcribing / Error Banner */}
        {(isRecording || isTranscribing || recorderError) && (
          <VoiceRecordingBar
            isRecording={isRecording}
            isTranscribing={isTranscribing}
            recordingTime={recordingTime}
            audioLevel={audioLevel}
            error={recorderError}
            onStop={stopRecording}
            onCancel={cancelRecording}
            onClearError={clearError}
          />
        )}

        {/* Input Textarea & Action Buttons */}
        <div className="flex items-end gap-2.5">
          <div className="flex-1">
            <div
              className={`rounded-2xl border bg-white transition-all shadow-sm ${
                isRecording
                  ? 'border-indigo-400 ring-2 ring-indigo-500/15'
                  : 'border-slate-200 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/15'
              } ${isLoading ? 'opacity-50' : ''}`}
            >
              <AutoResizableTextarea
                value={question}
                handleInput={(e) => setQuestion(e.target.value)}
                onKeyDown={onKeyPress}
                placeholder={
                  isRecording
                    ? "Enregistrement en cours... Parlez clairement dans votre micro."
                    : documentName
                    ? `Posez une question sur ${documentName}...`
                    : includedFilesCount === 0
                    ? "Incluez au moins un document pour poser une question..."
                    : `Posez une question sur vos ${includedFilesCount} document${includedFilesCount > 1 ? 's' : ''}...`
                }
                className="w-full resize-none bg-transparent p-3.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none"
                disabled={isLoading}
                aria-label="Type your question"
              />
            </div>
          </div>

          {/* Voice Microphone Button */}
          <button
            type="button"
            onClick={handleMicClick}
            disabled={isLoading || isTranscribing}
            className={`w-11 h-11 rounded-2xl flex justify-center items-center transition-all duration-200 shrink-0 ${
              isRecording
                ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/30 ring-2 ring-indigo-400/50 animate-pulse cursor-pointer"
                : isTranscribing
                ? "bg-indigo-100 text-indigo-500 cursor-wait border border-indigo-200"
                : "bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-indigo-600 border border-slate-200 cursor-pointer shadow-sm hover:border-slate-300"
            }`}
            title={
              isRecording
                ? "Arrêter l'enregistrement et transcrire"
                : isTranscribing
                ? "Transcription en cours..."
                : "Dictée vocale Whisper"
            }
            aria-label={isRecording ? "Arrêter l'enregistrement vocal" : "Démarrer la dictée vocale"}
          >
            {isRecording ? (
              <LuMicOff className="text-lg" />
            ) : (
              <LuMic className="text-lg" />
            )}
          </button>

          {/* Send Message Button */}
          <button
            onClick={onSubmit}
            disabled={isLoading || !question.trim() || !canSend || isRecording || isTranscribing}
            className={`w-11 h-11 rounded-2xl flex justify-center items-center transition-all duration-200 shrink-0 ${
              isLoading || !canSend || !question.trim() || isRecording || isTranscribing
                ? "bg-slate-100 text-slate-300 cursor-not-allowed border border-slate-200"
                : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-600/20 hover:shadow-lg hover:shadow-indigo-600/30 cursor-pointer"
            }`}
            title="Envoyer le message"
            aria-label="Send message"
          >
            <LuSend className="text-lg" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
});

GeneralChatInput.displayName = "GeneralChatInput";

export default GeneralChatInput;
