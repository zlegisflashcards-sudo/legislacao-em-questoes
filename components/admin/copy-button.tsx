"use client";

import { useState } from "react";

export default function CopyButton({ value, label = "Copiar" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  return <button type="button" className="admin-link-button" onClick={copy}>{copied ? "Copiado!" : label}</button>;
}
