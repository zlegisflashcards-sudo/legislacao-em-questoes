import "server-only";

// `require` preserva estas bibliotecas como dependências server-side do Next e
// evita colocar qualquer SDK Google no bundle do navegador.
const { Storage } = require("@google-cloud/storage") as { Storage: any };
const { getVercelOidcToken } = require("@vercel/oidc") as { getVercelOidcToken: () => Promise<string> };
const { ExternalAccountClient } = require("google-auth-library") as { ExternalAccountClient: any };

const REGION = "us-east1";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Configuração ${name} indisponível.`);
  return value;
}

/** Credenciais efêmeras Vercel OIDC -> GCP Workload Identity Federation. */
export function getLegiscastGcpAuthClient() {
  const projectNumber = required("GCP_PROJECT_NUMBER");
  const poolId = required("GCP_WORKLOAD_IDENTITY_POOL_ID");
  const providerId = required("GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID");
  const serviceAccount = required("GCP_SERVICE_ACCOUNT_EMAIL");
  const client = ExternalAccountClient.fromJSON({
    type: "external_account",
    audience: `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccount}:generateAccessToken`,
    subject_token_supplier: { getSubjectToken: getVercelOidcToken },
  });
  if (!client) throw new Error("Não foi possível iniciar a autenticação federada do Google Cloud.");
  return client;
}

export function getLegiscastOriginalBucketName() { return required("GCP_LEGISCAST_ORIGINAL_BUCKET"); }
export function getLegiscastGcpProjectId() { return required("GCP_PROJECT_ID"); }
export function getLegiscastCloudRunJobName() { return required("GCP_LEGISCAST_CLOUD_RUN_JOB"); }
export function getLegiscastCloudRunRegion() { return process.env.GCP_LEGISCAST_REGION?.trim() || REGION; }

export function getLegiscastOriginalStorage() {
  return new Storage({ projectId: getLegiscastGcpProjectId(), authClient: getLegiscastGcpAuthClient() });
}

export async function createLegiscastOriginalUploadUrl(path: string, contentType: string) {
  const [url] = await getLegiscastOriginalStorage().bucket(getLegiscastOriginalBucketName()).file(path).getSignedUrl({
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
