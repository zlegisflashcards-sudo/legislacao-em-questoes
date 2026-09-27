import { mutateSavedStudentMessage, savedStudentMessages } from "@/lib/student-center-server";
export async function GET(){try{return Response.json(await savedStudentMessages());}catch(error){return Response.json({error:error instanceof Error?error.message:"Falha ao carregar mensagens."},{status:500});}}
export async function POST(request:Request){try{return Response.json(await mutateSavedStudentMessage("POST",null,await request.json()));}catch(error){return Response.json({error:error instanceof Error?error.message:"Falha ao criar mensagem."},{status:400});}}
