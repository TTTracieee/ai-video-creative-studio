"use client";
import Image from "next/image";
import { Clapperboard } from "lucide-react";
import { useState } from "react";
export default function MediaThumbnail({ src, label }: { src?: string | null; label: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return (
    <div className="media-thumbnail">
      {src && src !== failedSrc ? (
        <Image
          key={src}
          src={src}
          alt={label}
          fill
          unoptimized
          loading="eager"
          sizes="(max-width: 700px) 100vw, 480px"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <div className="neutral-thumbnail">
          <Clapperboard size={28} />
          <span>{src ? "Preview unavailable" : "No video selected"}</span>
        </div>
      )}
    </div>
  );
}
