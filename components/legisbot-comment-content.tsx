"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { sanitizarComentarioHtml } from "@/lib/legisbot/sanitize-comment-html";

export default function LegisBotCommentContent({ html }: { html: string }) {
  const seguro = useMemo(() => sanitizarComentarioHtml(html), [html]);
  const contemHtml = /<(?:p|br|strong|b|em|i|ul|ol|li|h[2-4]|blockquote|hr|table|thead|tbody|tr|th|td|span|div)(?:\s|>|\/)/i.test(html);
  return contemHtml
    ? <div className="markdown-content" dangerouslySetInnerHTML={{ __html: seguro }} />
    : <div className="markdown-content"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{seguro}</ReactMarkdown></div>;
}
