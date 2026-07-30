"use client";

import { useState } from "react";

export default function CopyButton({ value, label = "Copiar" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    const copiedValue = value.startsWith("/") ? new URL(value, window.location.origin).href : value;
    await navigator.clipboard.writeText(copiedValue);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  return <button type="button" className="admin-link-button" onClick={copy}>{copied ? "Copiado!" : label}</button>;
}
