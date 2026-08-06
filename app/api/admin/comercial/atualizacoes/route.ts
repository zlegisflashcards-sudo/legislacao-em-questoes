import { handleCommercialGet, handleCommercialMutation } from "@/lib/commercial-admin-http";

export const GET = (request: Request) => handleCommercialGet("atualizacoes", request);
export const POST = (request: Request) => handleCommercialMutation("atualizacoes", request);
