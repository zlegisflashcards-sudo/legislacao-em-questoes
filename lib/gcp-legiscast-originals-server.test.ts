import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  authOptions: undefined as Record<string, unknown> | undefined,
  signedUrl: vi.fn(),
  getVercelOidcToken: vi.fn(async () => "test-oidc-token"),
}));

vi.mock("server-only", () => ({}));
import { createLegiscastGcpAuthClient, createLegiscastOriginalUploadUrl } from "@/lib/gcp-legiscast-originals-server";

describe("LegisCast Vercel OIDC -> WIF", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.authOptions = undefined;
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
});
