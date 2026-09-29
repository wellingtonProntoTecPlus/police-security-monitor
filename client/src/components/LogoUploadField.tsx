import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_LOGO_BYTES = 1024 * 1024;

type LogoUploadFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onUpload: (dataBase64: string, mimeType: string) => Promise<string>;
  uploadDisabled?: boolean;
  uploadDisabledReason?: string;
  title?: string;
};

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const separator = result.indexOf(",");
      if (separator < 0) {
        reject(new Error("Não foi possível ler o arquivo de logo."));
        return;
      }
      resolve(result.slice(separator + 1));
    };
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo de logo."));
    reader.readAsDataURL(file);
  });
}

export default function LogoUploadField({
  value,
  onChange,
  onUpload,
  uploadDisabled = false,
  uploadDisabledReason,
  title = "Logo da empresa",
}: LogoUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewError, setPreviewError] = useState(false);

  useEffect(() => {
    setPreviewError(false);
  }, [value]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!ACCEPTED_TYPES.has(file.type)) {
      toast.error("Formato não aceito. Escolha uma imagem PNG, JPG ou WebP.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("A logo deve ter no máximo 1 MB. O ideal é até 300 KB.");
      return;
    }
    setUploading(true);
    try {
      const url = await onUpload(await readFileAsBase64(file), file.type);
      onChange(url);
      toast.success("Logo enviada e salva com sucesso.");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível enviar a logo.");
    } finally {
      setUploading(false);
    }
  }

  const canUpload = !uploadDisabled && !uploading;

  return (
    <div>
      <Label>{title}</Label>
      <div className="mt-1 flex flex-wrap items-center gap-4">
        <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-black/20 p-2">
          {value && !previewError ? (
            <img src={value} alt={title} className="h-full w-full object-contain" onError={() => setPreviewError(true)} />
          ) : (
            <Upload className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-[220px] flex-1 space-y-2">
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange} className="sr-only" />
          <Button type="button" variant="outline" disabled={!canUpload} onClick={() => inputRef.current?.click()} className="gap-2">
            <Upload className="h-4 w-4" />
            {uploading ? "Enviando..." : "Enviar logo"}
          </Button>
          <p className="text-xs text-muted-foreground">PNG, JPG ou WebP · ideal até 300 KB · limite 1 MB</p>
          {uploadDisabledReason && <p className="text-xs text-amber-300">{uploadDisabledReason}</p>}
        </div>
      </div>
      <div className="mt-3">
        <Label className="text-xs text-muted-foreground">URL externa alternativa (opcional)</Label>
        <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Use o envio acima sempre que possível" className="mt-1" />
      </div>
    </div>
  );
}
