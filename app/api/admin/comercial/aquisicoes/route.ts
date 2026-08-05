import { handleCommercialGet, handleCommercialMutation } from "@/lib/commercial-admin-http";

export const GET = (request: Request) => handleCommercialGet("aquisicoes", request);
export const POST = (request: Request) => handleCommercialMutation("aquisicoes", request);
