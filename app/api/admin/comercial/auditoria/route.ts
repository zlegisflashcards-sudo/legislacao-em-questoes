import { handleCommercialGet } from "@/lib/commercial-admin-http";

export const GET = (request: Request) => handleCommercialGet("auditoria", request);
