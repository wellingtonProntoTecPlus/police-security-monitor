import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Camera, AlertCircle, Loader2 } from "lucide-react";

interface HLSPlayerProps {
  url?: string;
  label?: string;
  className?: string;
  autoPlay?: boolean;
  muted?: boolean;
}

export default function HLSPlayer({ url, label, className = "", autoPlay = true, muted = true }: HLSPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!url || !videoRef.current) {
      setStatus("idle");
      return;
    }

    const video = videoRef.current;
    setStatus("loading");
    setErrorMsg("");

    // Se o navegador suporta HLS nativamente (Safari)
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.addEventListener("loadedmetadata", () => {
        setStatus("playing");
        if (autoPlay) video.play().catch(() => {});
      });
      video.addEventListener("error", () => {
        setStatus("error");
        setErrorMsg("Erro ao carregar stream");
      });
      return;
    }

    // Usar hls.js
    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
      });
      hlsRef.current = hls;

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setStatus("playing");
        if (autoPlay) video.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setStatus("error");
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setErrorMsg("Erro de rede - câmera offline?");
              // Tentar reconectar após 5s
              setTimeout(() => hls.startLoad(), 5000);
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              setErrorMsg("Erro de mídia");
              hls.recoverMediaError();
              break;
            default:
              setErrorMsg("Erro fatal no stream");
              hls.destroy();
              break;
          }
        }
      });

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    } else {
      setStatus("error");
      setErrorMsg("Navegador não suporta HLS");
    }
  }, [url, autoPlay]);

  // Sem URL - placeholder
  if (!url) {
    return (
      <div className={`flex flex-col items-center justify-center bg-black/50 border border-border rounded-lg ${className}`}>
        <Camera className="h-8 w-8 text-muted-foreground mb-1" />
        <span className="text-muted-foreground text-sm font-medium">{label || "Sem stream"}</span>
      </div>
    );
  }

  return (
    <div className={`relative bg-black rounded-lg overflow-hidden border border-border ${className}`}>
      {/* Label */}
      {label && (
        <div className="absolute top-1 left-1 z-10 bg-black/70 px-2 py-0.5 rounded text-[10px] text-white font-medium">
          {label}
        </div>
      )}

      {/* Status indicator */}
      {status === "playing" && (
        <div className="absolute top-1 right-1 z-10 flex items-center gap-1 bg-black/70 px-1.5 py-0.5 rounded">
          <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[9px] text-white">AO VIVO</span>
        </div>
      )}

      {/* Loading */}
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-5">
          <Loader2 className="h-6 w-6 text-primary animate-spin" />
        </div>
      )}

      {/* Error */}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-5">
          <AlertCircle className="h-6 w-6 text-red-400 mb-1" />
          <span className="text-[10px] text-red-400">{errorMsg}</span>
        </div>
      )}

      {/* Video element */}
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        muted={muted}
        playsInline
        controls={false}
      />
    </div>
  );
}

