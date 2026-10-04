import { useState, useRef, useCallback, useEffect } from 'react';
import useAxiosPrivate from './useAxiosPrivate';

/**
 * Custom hook to record voice audio from microphone and transcribe it via Whisper API.
 * 
 * @param {Object} options
 * @param {Function} [options.onTranscriptionComplete] - Callback fired when transcription succeeds
 * @param {string} [options.language] - Optional language code (e.g. 'fr', 'en', 'Auto-detect')
 */
export const useAudioRecorder = ({ onTranscriptionComplete, language = 'Auto-detect' } = {}) => {
  const axiosPrivate = useAxiosPrivate();

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const audioChunksRef = useRef([]);
  const mimeTypeRef = useRef('audio/webm');
  const isCancelledRef = useRef(false);

  // Clean up all resources
  const cleanup = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch (e) {
        // ignore
      }
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    setAudioLevel(0);
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  /**
   * Start microphone audio capture and live waveform analysis.
   */
  const startRecording = useCallback(async () => {
    setError(null);
    isCancelledRef.current = false;
    audioChunksRef.current = [];
    setRecordingTime(0);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("L'enregistrement vocal n'est pas supporté par ce navigateur ou nécessite une connexion HTTPS.");
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      audioStreamRef.current = stream;

      // Audio analysis for real-time waveform visualization
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          const audioCtx = new AudioContextClass();
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          analyser.smoothingTimeConstant = 0.5;

          const source = audioCtx.createMediaStreamSource(stream);
          source.connect(analyser);

          audioContextRef.current = audioCtx;
          analyserRef.current = analyser;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateAudioMeter = () => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const average = sum / dataArray.length;
            // Normalize level between 0 and 100
            const normalized = Math.min(100, Math.round((average / 128) * 100));
            setAudioLevel(normalized);
            animationFrameRef.current = requestAnimationFrame(updateAudioMeter);
          };

          updateAudioMeter();
        }
      } catch (err) {
        console.warn('AudioContext visualization not available:', err);
      }

      // Detect optimal supported audio format
      const supportedTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        'audio/wav',
      ];
      let selectedMime = '';
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
        for (const type of supportedTypes) {
          if (MediaRecorder.isTypeSupported(type)) {
            selectedMime = type;
            break;
          }
        }
      }
      mimeTypeRef.current = selectedMime || 'audio/webm';

      const options = selectedMime ? { mimeType: selectedMime } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const wasCancelled = isCancelledRef.current;
        const chunks = [...audioChunksRef.current];
        const mime = mimeTypeRef.current;
        cleanup();
        setIsRecording(false);

        if (wasCancelled) {
          return;
        }

        const blob = new Blob(chunks, { type: mime || 'audio/webm' });

        if (blob.size < 500) {
          setError("L'enregistrement est trop court ou inaudible.");
          return;
        }

        // Send to backend Whisper endpoint
        setIsTranscribing(true);
        setError(null);

        try {
          const formData = new FormData();
          const ext = mime.includes('wav')
            ? 'wav'
            : mime.includes('ogg')
            ? 'ogg'
            : mime.includes('mp4')
            ? 'mp4'
            : 'webm';

          formData.append('file', blob, `voice_${Date.now()}.${ext}`);
          if (language) {
            formData.append('language', language);
          }

          const response = await axiosPrivate.post('/api/chat/transcribe', formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          });

          const transcribedText = response?.data?.text || '';

          if (transcribedText.trim()) {
            if (onTranscriptionComplete) {
              onTranscriptionComplete(transcribedText.trim());
            }
          } else {
            setError("Aucune parole détectée dans l'enregistrement.");
          }
        } catch (err) {
          console.error("Erreur de transcription audio:", err);
          const detail =
            err?.response?.data?.detail ||
            err?.message ||
            "Échec de la transcription. Veuillez réessayer.";
          setError(typeof detail === 'string' ? detail : JSON.stringify(detail));
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorder.start(250); // collect in 250ms chunks
      setIsRecording(true);

      timerIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      return true;
    } catch (err) {
      console.error("Erreur d'accès au micro:", err);
      cleanup();
      setIsRecording(false);

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError("Accès au microphone refusé. Veuillez autoriser l'accès dans votre navigateur.");
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setError("Aucun microphone détecté sur cet appareil.");
      } else {
        setError(`Erreur micro: ${err.message || 'Impossible d\'activer le microphone'}`);
      }
      return false;
    }
  }, [axiosPrivate, cleanup, language, onTranscriptionComplete]);

  /**
   * Stop recording and send audio for transcription.
   */
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    } else {
      cleanup();
      setIsRecording(false);
    }
  }, [cleanup]);

  /**
   * Cancel recording without transcribing.
   */
  const cancelRecording = useCallback(() => {
    isCancelledRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    } else {
      cleanup();
      setIsRecording(false);
    }
    setError(null);
  }, [cleanup]);

  return {
    isRecording,
    isTranscribing,
    recordingTime,
    audioLevel,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    clearError: () => setError(null),
  };
};

export default useAudioRecorder;
