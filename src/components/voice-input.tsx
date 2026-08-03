import { useCallback, useId, useRef, useState } from "react";
import { Loader2, Mic, Square, Trash2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MAX_SECONDS, useVoiceCapture } from "@/hooks/use-voice-capture";
import { transcribeVoiceNote } from "@/lib/transcribe.functions";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the recording."));
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

const mmss = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/* ------------------------------------------------------------------ */

/**
 * A mic button that appends dictated text to whatever field it is bound to.
 *
 * Speech is transcribed server-side and inserted as editable text, never
 * submitted straight through — the leader always reviews wording before it
 * becomes part of the record.
 */
export function VoiceButton({
  onTranscript,
  context,
  label = "Dictate",
  className,
}: {
  onTranscript: (text: string) => void;
  context?: string;
  label?: string;
  className?: string;
}) {
  const transcribe = useServerFn(transcribeVoiceNote);
  const [busy, setBusy] = useState(false);

  const handleClip = useCallback(
    async (clip: Blob) => {
      setBusy(true);
      try {
        const audio = await blobToBase64(clip);
        const res = await transcribe({
          data: { audio, mimeType: clip.type || "audio/webm", context },
        });
        if ("error" in res) {
          toast.error(res.error);
          return;
        }
        if (!res.text) {
          toast.message("Nothing was picked up", {
            description: "Try again a little closer to the mic.",
          });
          return;
        }
        onTranscript(res.text);
      } finally {
        setBusy(false);
      }
    },
    [context, onTranscript, transcribe],
  );

  const voice = useVoiceCapture(handleClip);
  const recording = voice.state === "recording";
  const working = busy || voice.state === "transcribing";

  if (!voice.supported) return null;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {recording ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="tap-target text-muted-foreground"
            onClick={voice.cancel}
            aria-label="Discard recording"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            onClick={voice.stop}
            className="tap-target gap-2 bg-critical text-critical-foreground hover:bg-critical/90"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            <span className="tabular-nums">{mmss(voice.seconds)}</span>
            <span className="sr-only">Stop recording and transcribe</span>
          </Button>
          <LevelMeter level={voice.level} />
        </>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={voice.start}
          disabled={working}
          className="tap-target gap-2"
        >
          {working ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
          {working ? "Transcribing…" : label}
        </Button>
      )}
      {voice.error ? (
        <p role="alert" className="text-xs text-critical">
          {voice.error}
        </p>
      ) : null}
    </div>
  );
}

function LevelMeter({ level }: { level: number }) {
  // Five bars, each lighting up at a progressively higher input level.
  return (
    <div className="flex h-6 items-end gap-0.5" aria-hidden>
      {[0.06, 0.14, 0.24, 0.38, 0.55].map((threshold, i) => (
        <span
          key={threshold}
          className={cn(
            "w-1 rounded-full transition-all duration-75",
            level >= threshold ? "bg-critical" : "bg-border",
          )}
          style={{ height: `${8 + i * 4}px` }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Textarea with dictation built in. Used for every free-text field on the
 * round composer so a manager can fill the whole form by talking.
 */
export function VoiceTextarea({
  id,
  label,
  value,
  onChange,
  placeholder,
  context,
  rows = 3,
  required,
  description,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  context?: string;
  rows?: number;
  required?: boolean;
  description?: string;
}) {
  const generated = useId();
  const fieldId = id ?? generated;
  const ref = useRef<HTMLTextAreaElement>(null);

  const append = useCallback(
    (text: string) => {
      const next = value.trim() ? `${value.trim()} ${text}` : text;
      onChange(next);
      // Put the caret at the end so the user can keep typing straight away.
      requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(next.length, next.length);
      });
    },
    [onChange, value],
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={fieldId} className="text-sm">
          {label}
          {required ? <span className="ms-0.5 text-critical">*</span> : null}
        </Label>
        <VoiceButton onTranscript={append} context={context ?? label} label="Dictate" />
      </div>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      <Textarea
        id={fieldId}
        ref={ref}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="text-base"
      />
      <p className="text-[11px] text-muted-foreground">
        Dictation adds editable text — review it before saving. Max {MAX_SECONDS / 60} minutes per
        clip.
      </p>
    </div>
  );
}
