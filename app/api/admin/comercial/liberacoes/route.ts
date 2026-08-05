import { handleCommercialGet, handleCommercialMutation } from "@/lib/commercial-admin-http";

export const GET = (request: Request) => handleCommercialGet("liberacoes", request);
export const POST = (request: Request) => handleCommercialMutation("liberacoes", request);
