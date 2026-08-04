import { useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/** Initials fallback — used everywhere a photo might be missing. */
export function PersonAvatar({
  name,
  src,
  size = 44,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const initials =
    (name || "?")
      .split(" ")
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return (
    <span
      className={cn(
        "relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-accent text-accent-foreground",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          // A broken or deleted file shouldn't leave an empty grey circle.
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : null}
      {!src ? (
        <span className="font-medium" style={{ fontSize: Math.round(size * 0.36) }}>
          {initials}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Upload straight to Supabase Storage from the browser.
 *
 * Path is avatars/<user_id>/<timestamp>.<ext>, which is what the storage policy
 * keys off — you can write your own folder, and admins can write anyone's.
 * The timestamped filename sidesteps CDN caching of a replaced photo.
 */
export function AvatarUpload({
  userId,
  name,
  currentUrl,
  onChange,
  size = 72,
}: {
  userId: string;
  name: string;
  currentUrl: string | null;
  onChange: (url: string | null) => void | Promise<void>;
  size?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      toast.error("That image is over 2 MB. Pick a smaller one.");
      return;
    }
    setBusy(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      await onChange(data.publicUrl);
      toast.success("Photo updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      <PersonAvatar name={name} src={currentUrl} size={size} />
      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          {currentUrl ? "Change photo" : "Add photo"}
        </Button>
        {currentUrl ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground"
            disabled={busy}
            onClick={() => void onChange(null)}
          >
            <Trash2 className="h-4 w-4" />
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  );
}
