import { handleCommercialGet, handleCommercialMutation } from "@/lib/commercial-admin-http";

export const GET = (request: Request) => handleCommercialGet("leis", request);
export const POST = (request: Request) => handleCommercialMutation("leis", request);
