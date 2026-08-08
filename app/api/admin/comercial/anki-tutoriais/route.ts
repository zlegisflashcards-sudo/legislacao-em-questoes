import { handleCommercialGet, handleCommercialMutation } from "@/lib/commercial-admin-http";

export const GET = (request: Request) => handleCommercialGet("anki_tutoriais", request);
export const POST = (request: Request) => handleCommercialMutation("anki_tutoriais", request);
