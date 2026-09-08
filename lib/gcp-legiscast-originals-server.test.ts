import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const state = vi.hoisted(() => ({
  authOptions: undefined as Record<string, unknown> | undefined,
  getVercelOidcToken: vi.fn(async () => "test-oidc-token"),
}));

vi.mock("server-only", () => ({}));
import { createLegiscastGcpAuthClient, createLegiscastV4CanonicalRequest, createLegiscastV4UploadUrl } from "@/lib/gcp-legiscast-originals-server";

const serviceAccount = "legiscast-control@legisflashcards-audio.iam.gserviceaccount.com";
const bucket = "legiscast-originals-test";
const now = new Date("2026-09-07T12:34:56.000Z");

describe("LegisCast Vercel OIDC -> WIF", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.authOptions = undefined;
    process.env.GCP_PROJECT_ID = "legisflashcards-audio";
    process.env.GCP_PROJECT_NUMBER = "219213403281";
    process.env.GCP_WORKLOAD_IDENTITY_POOL_ID = "vercel";
    process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID = "vercel";
    process.env.GCP_SERVICE_ACCOUNT_EMAIL = serviceAccount;
    process.env.GCP_LEGISCAST_ORIGINAL_BUCKET = bucket;
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
    await expect((state.authOptions?.subjectTokenSupplier as () => Promise<string>)()).resolves.toBe("test-oidc-token");
  });

  it("cria canonical URI, query, headers e scope V4 determinísticos", () => {
    const result = createLegiscastV4CanonicalRequest("pasta com espaço/ação/áudio final.mp3", "audio/mpeg", serviceAccount, bucket, now);

    expect(result.canonicalUri).toBe("/legiscast-originals-test/pasta%20com%20espa%C3%A7o/a%C3%A7%C3%A3o/%C3%A1udio%20final.mp3");
    expect(result.canonicalQuery).toBe("X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=legiscast-control%40legisflashcards-audio.iam.gserviceaccount.com%2F20260907%2Fauto%2Fstorage%2Fgoog4_request&X-Goog-Date=20260907T123456Z&X-Goog-Expires=900&X-Goog-SignedHeaders=content-type%3Bhost");
    expect(result.canonicalHeaders).toBe("content-type:audio/mpeg\nhost:storage.googleapis.com\n");
    expect(result.credentialScope).toBe("20260907/auto/storage/goog4_request");
    expect(result.canonicalRequest).toContain("\ncontent-type;host\nUNSIGNED-PAYLOAD");
  });

  it("chama IAM signBlob com access token WIF e transforma base64 em assinatura hexadecimal", async () => {
    const requests: RequestInit[] = [];
    const fetchImpl = vi.fn(async (_input: string, init: RequestInit) => { requests.push(init); return { ok: true, status: 200, json: async () => ({ signedBlob: Buffer.from([0, 255, 16]).toString("base64") }) }; });
    const auth = { getAccessToken: vi.fn(async () => ({ token: "federated-token" })) };

    const url = await createLegiscastV4UploadUrl("pasta/original.mp3", "audio/mpeg", { auth, serviceAccount, bucket, now, fetchImpl: fetchImpl as any });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/legiscast-control%40legisflashcards-audio.iam.gserviceaccount.com:signBlob",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(requests[0].body as string);
    expect(Buffer.from(body.payload, "base64").toString()).toBe("GOOG4-RSA-SHA256\n20260907T123456Z\n20260907/auto/storage/goog4_request\nfdc0baef89fcca43704089da4803f613840c905171c59354da699fffa25c3b14");
    expect(url).toContain("X-Goog-Signature=00ff10");
    expect(url).toContain("X-Goog-SignedHeaders=content-type%3Bhost");
  });

  it("não usa Storage ou GoogleAuth/ADC para assinar", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ signedBlob: "AQ==" }) }));
    await createLegiscastV4UploadUrl("original.mp3", "audio/mpeg", { auth: { getAccessToken: async () => "wif-token" }, serviceAccount, bucket, now, fetchImpl: fetchImpl as any });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const source = readFileSync("lib/gcp-legiscast-originals-server.ts", "utf8");
    expect(source).not.toContain("getSignedUrl");
    expect(source).not.toContain("GoogleAuth");
  });

  it("propaga 403 de signBlob sem vazar token", async () => {
    const error = await createLegiscastV4UploadUrl("original.mp3", "audio/mpeg", { auth: { getAccessToken: async () => "secret-token" }, serviceAccount, bucket, now, fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({}) }) }).catch(error => error);

    expect(error).toMatchObject({ message: "IAM Credentials signBlob falhou (403).", code: 403 });
    expect(error.message).not.toContain("secret-token");
  });
});
