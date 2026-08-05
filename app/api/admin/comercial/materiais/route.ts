import { handleCommercialGet, handleCommercialMutation } from "@/lib/commercial-admin-http";

export const GET = (request: Request) => handleCommercialGet("materiais", request);
export const POST = (request: Request) => handleCommercialMutation("materiais", request);
