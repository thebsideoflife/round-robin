import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceState = "idle" | "requesting" | "recording" | "transcribing" | "error";

export interface VoiceCapture {
  state: VoiceState;
  /** 0–1, drives the live level meter so users can see the mic is live. */
  level: number;
  /** Seconds recorded so far. */
  seconds: number;
  error: string | null;
  /** True when this browser can record at all. */
  supported: boolean;
  start: () => Promise<void>;
  stop: () => void;
  cancel: () => void;
}

/** Hard ceiling per clip. Keeps uploads small and transcription latency sane. */
export const MAX_SECONDS = 180;

/**
 * Picks a container the browser will actually produce.
 * iOS Safari only does audio/mp4; Chrome and Firefox prefer webm/opus.
 */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

function friendlyError(err: unknown): string {
  const name = (err as { name?: string })?.name;
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Microphone access was blocked. Enable it for this site in your browser settings.";
    case "NotFoundError":
      return "No microphone was found on this device.";
    case "NotReadableError":
      return "The microphone is in use by another app.";
    default:
      return "Could not start recording. Check your microphone and try again.";
  }
}

/**
 * Records a short audio clip and hands the blob to `onClip`.
 *
 * Deliberate choices:
 *  - MediaRecorder rather than the Web Speech API, because Web Speech does not
 *    exist in iOS Safari and most rounding happens on an iPhone in a hallway.
 *  - The audio blob is passed straight to the caller and never persisted here.
 *  - The mic track is stopped on unmount, on error and on cancel, so the
 *    recording indicator never stays lit after the user leaves the screen.
 */
export function useVoiceCapture(onClip: (clip: Blob) => Promise<void> | void): VoiceCapture {
  const [state, setState] = useState<VoiceState>("idle");
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const cancelledRef = useRef(false);

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        typeof MediaRecorder !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia &&
        // getUserMedia is gated on a secure context everywhere.
        (window.isSecureContext || location.hostname === "localhost"),
    );
  }, []);

  const teardown = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    recorderRef.current = null;
    setLevel(0);
  }, []);

  useEffect(() => teardown, [teardown]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    stop();
    teardown();
    setState("idle");
    setSeconds(0);
  }, [stop, teardown]);

  const start = useCallback(async () => {
    if (state === "recording" || state === "requesting") return;
    setError(null);
    setSeconds(0);
    cancelledRef.current = false;
    setState("requesting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeType || "audio/webm",
        });
        chunksRef.current = [];
        teardown();

        if (cancelledRef.current || blob.size < 1200) {
          setState("idle");
          return;
        }
        setState("transcribing");
        try {
          await onClip(blob);
          setState("idle");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Transcription failed.");
          setState("error");
        }
      };

      // Live level meter.
      try {
        const Ctx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        audioCtxRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(buf);
          let peak = 0;
          for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128) / 128);
          setLevel(peak);
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        // A missing AudioContext costs us the meter, not the recording.
      }

      recorder.start(1000);
      setState("recording");

      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS) stop();
          return s + 1;
        });
      }, 1000);
    } catch (err) {
      teardown();
      setError(friendlyError(err));
      setState("error");
    }
  }, [onClip, state, stop, teardown]);

  return { state, level, seconds, error, supported, start, stop, cancel };
}
