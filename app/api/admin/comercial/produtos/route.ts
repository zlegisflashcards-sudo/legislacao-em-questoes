import { handleCommercialGet, handleCommercialMutation } from "@/lib/commercial-admin-http";

export const GET = (request: Request) => handleCommercialGet("produtos", request);
export const POST = (request: Request) => handleCommercialMutation("produtos", request);
