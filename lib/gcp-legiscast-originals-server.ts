import "server-only";

const REGION = "us-east1";
type IdentityPoolClientConstructor = new (options: Record<string, unknown>) => any;
type AuthDependencies = { IdentityPoolClient: IdentityPoolClientConstructor; getVercelOidcToken: () => Promise<string> };
type FederatedAuthClient = { getAccessToken: () => Promise<unknown>; getRequestHeaders?: (...args: any[]) => Promise<Record<string, string>>; request?: (...args: any[]) => Promise<unknown> };
type FetchLike = (input: string, init: RequestInit) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
type StorageConstructor = new (options: Record<string, unknown>) => any;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Configuração ${name} indisponível.`);
  return value;
}

/** Credenciais efêmeras Vercel OIDC -> GCP Workload Identity Federation. */
export function createLegiscastGcpAuthClient(dependencies: AuthDependencies) {
  const projectNumber = required("GCP_PROJECT_NUMBER");
  const poolId = required("GCP_WORKLOAD_IDENTITY_POOL_ID");
  const providerId = required("GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID");
  const serviceAccount = required("GCP_SERVICE_ACCOUNT_EMAIL");
  const client = new dependencies.IdentityPoolClient({
    audience: `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`,
    subjectTokenType: "urn:ietf:params:oauth:token-type:id_token",
    tokenUrl: "https://sts.googleapis.com/v1/token",
    serviceAccountImpersonationUrl: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccount}:generateAccessToken`,
    subjectTokenSupplier: async () => dependencies.getVercelOidcToken(),
  });
  if (!client) throw new Error("Não foi possível iniciar a autenticação federada do Google Cloud.");
  return client;
}

export function getLegiscastGcpAuthClient() {
  const { IdentityPoolClient } = require("google-auth-library") as { IdentityPoolClient: IdentityPoolClientConstructor };
  const { getVercelOidcToken } = require("@vercel/oidc") as { getVercelOidcToken: () => Promise<string> };
  return createLegiscastGcpAuthClient({ IdentityPoolClient, getVercelOidcToken });
}

export function getLegiscastOriginalBucketName() { return required("GCP_LEGISCAST_ORIGINAL_BUCKET"); }
export function getLegiscastGcpProjectId() { return required("GCP_PROJECT_ID"); }
export function getLegiscastCloudRunJobName() { return required("GCP_LEGISCAST_CLOUD_RUN_JOB"); }
export function getLegiscastCloudRunRegion() { return process.env.GCP_LEGISCAST_REGION?.trim() || REGION; }

function accessToken(value: unknown) {
  if (typeof value === "string" && value) return value;
  if (value && typeof value === "object" && typeof (value as { token?: unknown }).token === "string") return (value as { token: string }).token;
  throw new Error("Não foi possível obter access token federado para assinatura.");
}

/** Contrato GoogleAuth-like que impede fallback para ADC no signer V4. */
export function createLegiscastStorageSigner(auth: FederatedAuthClient, serviceAccount = required("GCP_SERVICE_ACCOUNT_EMAIL"), fetchImpl: FetchLike = fetch) {
  return {
    getCredentials: async () => ({ client_email: serviceAccount }),
    getAccessToken: () => auth.getAccessToken(),
    getRequestHeaders: async (...args: any[]) => auth.getRequestHeaders?.(...args) ?? { Authorization: `Bearer ${accessToken(await auth.getAccessToken())}` },
    request: (...args: any[]) => {
      if (!auth.request) throw new Error("Cliente federado não suporta requisições autenticadas.");
      return auth.request(...args);
    },
    sign: async (blobToSign: string) => {
      const token = accessToken(await auth.getAccessToken());
      const response = await fetchImpl(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccount)}:signBlob`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ payload: Buffer.from(blobToSign).toString("base64") }),
      });
      if (!response.ok) {
        const error = new Error(`IAM Credentials signBlob falhou (${response.status}).`);
        Object.assign(error, { code: response.status });
        throw error;
      }
      const body = await response.json() as { signedBlob?: unknown };
      if (typeof body.signedBlob !== "string" || !body.signedBlob) throw new Error("IAM Credentials não retornou assinatura.");
      return body.signedBlob;
    },
  };
}

export function createLegiscastOriginalStorage(Storage: StorageConstructor, authClient: FederatedAuthClient, signer = createLegiscastStorageSigner(authClient)) {
  return new Storage({ projectId: getLegiscastGcpProjectId(), authClient: signer });
}

export function getLegiscastOriginalStorage() {
  const { Storage } = require("@google-cloud/storage") as { Storage: StorageConstructor };
  const authClient = getLegiscastGcpAuthClient();
  return createLegiscastOriginalStorage(Storage, authClient);
}

export async function createLegiscastOriginalUploadUrl(path: string, contentType: string, storage = getLegiscastOriginalStorage()) {
  const [url] = await storage.bucket(getLegiscastOriginalBucketName()).file(path).getSignedUrl({
    version: "v4", action: "write", expires: Date.now() + 15 * 60 * 1000, contentType,
  });
  return url;
}

export async function getLegiscastOriginalMetadata(path: string) {
  const [metadata] = await getLegiscastOriginalStorage().bucket(getLegiscastOriginalBucketName()).file(path).getMetadata();
  return metadata;
}

export async function runLegiscastCloudRunJob(jobId: string) {
  const auth = getLegiscastGcpAuthClient();
  const token = await auth.getAccessToken();
  if (!token) throw new Error("Não foi possível autenticar a execução do processamento.");
  const projectId = getLegiscastGcpProjectId();
  const region = getLegiscastCloudRunRegion();
  const jobName = getLegiscastCloudRunJobName();
  const response = await fetch(`https://run.googleapis.com/v2/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(region)}/jobs/${encodeURIComponent(jobName)}:run`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ overrides: { containerOverrides: [{ args: [jobId] }] } }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Não foi possível iniciar o processamento (${response.status}).`);
  return response.json() as Promise<unknown>;
}
