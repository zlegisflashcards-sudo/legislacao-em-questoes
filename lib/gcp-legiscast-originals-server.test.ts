import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  authOptions: undefined as Record<string, unknown> | undefined,
  storageOptions: undefined as Record<string, unknown> | undefined,
  signedUrl: vi.fn(),
  getVercelOidcToken: vi.fn(async () => "test-oidc-token"),
}));

vi.mock("server-only", () => ({}));
import { createLegiscastGcpAuthClient, createLegiscastOriginalStorage, createLegiscastOriginalUploadUrl, createLegiscastStorageSigner } from "@/lib/gcp-legiscast-originals-server";

describe("LegisCast Vercel OIDC -> WIF", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.authOptions = undefined;
    state.storageOptions = undefined;
    process.env.GCP_PROJECT_ID = "legisflashcards-audio";
    process.env.GCP_PROJECT_NUMBER = "219213403281";
    process.env.GCP_WORKLOAD_IDENTITY_POOL_ID = "vercel";
    process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID = "vercel";
    process.env.GCP_SERVICE_ACCOUNT_EMAIL = "legiscast-control@legisflashcards-audio.iam.gserviceaccount.com";
    process.env.GCP_LEGISCAST_ORIGINAL_BUCKET = "legiscast-originals-test";
  });

  it("cria IdentityPoolClient com supplier OIDC, audience WIF e impersonação corretos", async () => {
    createLegiscastGcpAuthClient({
      IdentityPoolClient: class { constructor(options: Record<string, unknown>) { state.authOptions = options; } },
      getVercelOidcToken: state.getVercelOidcToken,
    });

    expect(state.authOptions).toMatchObject({
      audience: "//iam.googleapis.com/projects/219213403281/locations/global/workloadIdentityPools/vercel/providers/vercel",
      subjectTokenType: "urn:ietf:params:oauth:token-type:id_token",
      tokenUrl: "https://sts.googleapis.com/v1/token",
      serviceAccountImpersonationUrl: "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/legiscast-control@legisflashcards-audio.iam.gserviceaccount.com:generateAccessToken",
    });
    expect(state.authOptions?.subjectTokenSupplier).toEqual(expect.any(Function));
    await expect((state.authOptions?.subjectTokenSupplier as () => Promise<string>)()).resolves.toBe("test-oidc-token");
    expect(state.getVercelOidcToken).toHaveBeenCalledOnce();
  });

  it("gera a URL assinada sem credenciais reais", async () => {
    state.signedUrl.mockResolvedValueOnce(["https://storage.example.invalid/upload"]);

    const storage = { bucket: () => ({ file: () => ({ getSignedUrl: state.signedUrl }) }) };
    await expect(createLegiscastOriginalUploadUrl("legiscast-audio-original/job/original.mp3", "audio/mpeg", storage))
      .resolves.toBe("https://storage.example.invalid/upload");

    expect(state.signedUrl).toHaveBeenCalledWith(expect.objectContaining({
      version: "v4", action: "write", contentType: "audio/mpeg",
    }));
  });

  it("entrega ao Storage um signer explícito, sem GoogleAuth/ADC", async () => {
    const auth = { getAccessToken: vi.fn(async () => ({ token: "federated-token" })), request: vi.fn(), getRequestHeaders: vi.fn() };
    const signer = createLegiscastStorageSigner(auth, "legiscast-control@legisflashcards-audio.iam.gserviceaccount.com", vi.fn() as any);
    class Storage { constructor(options: Record<string, unknown>) { state.storageOptions = options; } }

    createLegiscastOriginalStorage(Storage, auth, signer);

    expect(state.storageOptions?.projectId).toBe("legisflashcards-audio");
    expect(state.storageOptions?.authClient).toBe(signer);
    await expect((signer as any).getCredentials()).resolves.toEqual({ client_email: "legiscast-control@legisflashcards-audio.iam.gserviceaccount.com" });
  });

  it("assina V4 por IAM Credentials com access token WIF, sem chave local", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ signedBlob: "signed-base64" }) }));
    const auth = { getAccessToken: vi.fn(async () => ({ token: "federated-token" })) };
    const signer = createLegiscastStorageSigner(auth, "legiscast-control@legisflashcards-audio.iam.gserviceaccount.com", fetchImpl as any);

    await expect(signer.sign("string-to-sign")).resolves.toBe("signed-base64");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/legiscast-control%40legisflashcards-audio.iam.gserviceaccount.com:signBlob",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ payload: Buffer.from("string-to-sign").toString("base64") }) }),
    );
    expect(auth.getAccessToken).toHaveBeenCalledOnce();
  });

  it("gera URL V4 pelo signer IAM entregue ao Storage", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ signedBlob: "signed-base64" }) }));
    const auth = { getAccessToken: vi.fn(async () => ({ token: "federated-token" })), request: vi.fn(), getRequestHeaders: vi.fn() };
    class Storage {
      constructor(options: Record<string, unknown>) { state.storageOptions = options; }
      bucket() { return { file: () => ({ getSignedUrl: async () => { await (state.storageOptions?.authClient as any).sign("v4-string-to-sign"); return ["https://storage.example.invalid/signed"]; } }) }; }
    }
    const storage = createLegiscastOriginalStorage(Storage, auth, createLegiscastStorageSigner(auth, "legiscast-control@legisflashcards-audio.iam.gserviceaccount.com", fetchImpl as any));

    await expect(createLegiscastOriginalUploadUrl("legiscast-audio-original/job/original.mp3", "audio/mpeg", storage)).resolves.toBe("https://storage.example.invalid/signed");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("propaga falha de IAM Credentials signBlob sem revelar token", async () => {
    const auth = { getAccessToken: vi.fn(async () => "federated-token") };
    const signer = createLegiscastStorageSigner(auth, "legiscast-control@legisflashcards-audio.iam.gserviceaccount.com", vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) })) as any);

    await expect(signer.sign("string-to-sign")).rejects.toMatchObject({ message: "IAM Credentials signBlob falhou (403).", code: 403 });
  });
});
