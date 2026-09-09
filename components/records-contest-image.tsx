"use client";

import { useState } from "react";

type Props = {
  src: string | null;
  alt: string;
  className?: string;
};

/** A imagem é opcional: o monograma preserva o layout quando a liga não a tiver. */
export function RecordsContestImage({ src, alt, className = "" }: Props) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span aria-label={alt} className={`inline-flex items-center justify-center bg-[#062a5f] font-black text-amber-300 ${className}`}>PM</span>;
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}
