import { handleCommercialGet, handleCommercialMutation } from "@/lib/commercial-admin-http";

export const GET = (request: Request) => handleCommercialGet("alunos", request);
export const POST = (request: Request) => handleCommercialMutation("alunos", request);
