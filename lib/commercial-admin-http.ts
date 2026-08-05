import { NextResponse } from "next/server";
import {
  CommercialHttpError,
  getCommercialResource,
  mutateCommercialResource,
  type CommercialResource,
} from "@/lib/commercial-admin-server";
import {
  CommercialValidationError,
  publicErrorMessage,
} from "@/lib/commercial-admin-validation";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

function failure(error: unknown) {
  if (error instanceof CommercialHttpError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status, headers: NO_STORE_HEADERS },
    );
  }

  if (error instanceof CommercialValidationError) {
    return NextResponse.json(
      { error: publicErrorMessage(error) },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  console.error("Falha interna na administração comercial.");
  return NextResponse.json(
    { error: "Não foi possível concluir a operação." },
    { status: 500, headers: NO_STORE_HEADERS },
  );
}

export async function handleCommercialGet(
  resource: CommercialResource,
  request: Request,
) {
  try {
    const result = await getCommercialResource(resource, request);
    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return failure(error);
  }
}

export async function handleCommercialMutation(
  resource: CommercialResource,
  request: Request,
) {
  try {
    const result = await mutateCommercialResource(resource, request);
    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return failure(error);
  }
}
