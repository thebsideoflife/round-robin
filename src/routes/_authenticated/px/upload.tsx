import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { processReport } from "@/lib/reports.functions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/px/upload")({
  head: () => ({
    meta: [
      { title: "Upload scorecard — PX Engine" },
      {
        name: "description",
        content: "Upload a Press Ganey Site Scorecard PDF and generate an action plan.",
      },
    ],
  }),
  component: UploadPage,
});

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function UploadPage() {
  const navigate = useNavigate();
  const process = useServerFn(processReport);
  const { scope } = useStore();
  const [file, setFile] = useState<File | null>(null);
  const [clinicId, setClinicId] = useState<string>("none");
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const pdfBase64 = await fileToBase64(file);
      const res = await process({
        data: { pdfBase64, fileName: file.name, clinicId: clinicId === "none" ? null : clinicId },
      });
      toast.success("Report ready");
      navigate({ to: "/px/$reportId", params: { reportId: res.reportId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Processing failed");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Upload scorecard</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Drop a Press Ganey Site Scorecard PDF. We'll extract every score and generate a full action
        plan in under a minute.
      </p>

      <div className="mt-6 rounded-xl border border-border bg-card p-6 sm:p-8">
        <label
          htmlFor="file"
          className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30 px-6 py-12 text-center transition-colors hover:bg-muted/50"
        >
          <Upload className="h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">{file ? file.name : "Click to choose a PDF"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Press Ganey Site Scorecard, PDF format
          </p>
          <input
            id="file"
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <div className="mt-6 space-y-2">
          <Label htmlFor="clinic">Clinic (optional)</Label>
          <Select value={clinicId} onValueChange={setClinicId}>
            <SelectTrigger id="clinic">
              <SelectValue placeholder="Not linked to a clinic" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not linked to a clinic</SelectItem>
              {scope.clinics.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Linking a scorecard to a clinic shares it with that clinic's leadership.
          </p>
        </div>

        <Button onClick={onSubmit} disabled={!file || busy} className="mt-6 w-full" size="lg">
          {busy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Analyzing report… this takes 30–60 seconds
            </>
          ) : (
            "Analyze report"
          )}
        </Button>

        <p className="mt-4 text-xs text-muted-foreground">
          We extract sections, providers, the Priority Index, and trends; then run a rule engine to
          surface the top 3–5 opportunities and generate role-based action plans with 30/60/90 day
          milestones.
        </p>
      </div>
    </div>
  );
}
