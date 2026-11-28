export type SalesStage = "qualificacao" | "catalogo" | "compra" | "suporte" | "humano";
export type WhatsAppRecipient = { kind: "phone" | "bsuid"; value: string };

export type SalesProduct = {
  id: string;
  name: string;
  slug: string;
  description: string;
  priceCents: number | null;
  checkoutUrl: string | null;
  detailUrl: string;
  freeStudyUrl: string | null;
  availability: "ready" | "coming_soon";
  modules: string[];
  lawNames: string[];
};

export type SalesTurn = { role: "user" | "assistant"; content: string };
export type SalesReply = {
  text: string;
  stage: SalesStage;
  handoff: boolean;
  optOut: boolean;
  productIds: string[];
  engine: "ai" | "rules";
  reason: string | null;
};

export type IncomingWhatsAppMessage = {
  messageId: string;
  phoneNumberId: string;
  recipient: WhatsAppRecipient;
  phoneAlias?: string;
  displayName: string | null;
  timestamp: string;
  kind: "text" | "unsupported";
  text: string;
};

export type IncomingWhatsAppStatus = {
  messageId: string;
  correlationId: string | null;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
};

export type WhatsAppEnvelope = {
  messages: IncomingWhatsAppMessage[];
  statuses: IncomingWhatsAppStatus[];
};
