import "server-only";
import { createHash } from "node:crypto";

const REGION = "us-east1";
type IdentityPoolClientConstructor = new (options: Record<string, unknown>) => any;
type AuthDependencies = { IdentityPoolClient: IdentityPoolClientConstructor; getVercelOidcToken: () => Promise<string> };
type FederatedAuthClient = { getAccessToken: () => Promise<unknown> };
type FetchLike = (input: string, init: RequestInit) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
type V4UploadDependencies = { auth: FederatedAuthClient; serviceAccount: string; bucket: string; now?: Date; fetchImpl?: FetchLike };
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
    subjectTokenSupplier: { getSubjectToken: async () => dependencies.getVercelOidcToken() },
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

function rfc3986(value: string) { return encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`); }
function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }
function v4Date(now: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
  return { date, timestamp: `${date}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z` };
}

export function createLegiscastV4CanonicalRequest(path: string, contentType: string, serviceAccount: string, bucket: string, now: Date) {
  const { date, timestamp } = v4Date(now);
  const credentialScope = `${date}/auto/storage/goog4_request`;
  const canonicalUri = `/${rfc3986(bucket)}/${path.split("/").map(rfc3986).join("/")}`;
  const canonicalHeaders = `content-type:${contentType.trim()}\nhost:storage.googleapis.com\n`;
  const signedHeaders = "content-type;host";
  const query = new Map<string, string>([
    ["X-Goog-Algorithm", "GOOG4-RSA-SHA256"],
    ["X-Goog-Credential", `${serviceAccount}/${credentialScope}`],
    ["X-Goog-Date", timestamp],
    ["X-Goog-Expires", "900"],
    ["X-Goog-SignedHeaders", signedHeaders],
  ]);
  const canonicalQuery = [...query].map(([key, value]) => [rfc3986(key), rfc3986(value)] as const).sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)).map(([key, value]) => `${key}=${value}`).join("&");
  const canonicalRequest = `PUT\n${canonicalUri}\n${canonicalQuery}\n${canonicalHeaders}\n${signedHeaders}\nUNSIGNED-PAYLOAD`;
  return { canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, credentialScope, timestamp, canonicalRequest };
}

function logUploadAuthStage(stage: "oidc_client_created" | "access_token_obtained" | "canonical_request_created" | "signblob_started" | "signblob_completed" | "signed_url_created") {
  console.info("legiscast_upload_auth_stage", { stage });
}

export async function createLegiscastV4UploadUrl(path: string, contentType: string, dependencies: V4UploadDependencies) {
  const now = dependencies.now ?? new Date();
  const token = accessToken(await dependencies.auth.getAccessToken());
  logUploadAuthStage("access_token_obtained");
  const parts = createLegiscastV4CanonicalRequest(path, contentType, dependencies.serviceAccount, dependencies.bucket, now);
  logUploadAuthStage("canonical_request_created");
  const stringToSign = `GOOG4-RSA-SHA256\n${parts.timestamp}\n${parts.credentialScope}\n${sha256(parts.canonicalRequest)}`;
  logUploadAuthStage("signblob_started");
  const response = await (dependencies.fetchImpl ?? fetch)(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(dependencies.serviceAccount)}:signBlob`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ payload: Buffer.from(stringToSign).toString("base64") }),
  });
  if (!response.ok) {
    const error = new Error(`IAM Credentials signBlob falhou (${response.status}).`);
    Object.assign(error, { code: response.status });
    throw error;
  }
  const body = await response.json() as { signedBlob?: unknown };
  if (typeof body.signedBlob !== "string" || !body.signedBlob) throw new Error("IAM Credentials não retornou assinatura.");
  logUploadAuthStage("signblob_completed");
  const url = new URL(`https://storage.googleapis.com/${rfc3986(dependencies.bucket)}/${path.split("/").map(rfc3986).join("/")}`);
  url.search = `${parts.canonicalQuery}&X-Goog-Signature=${Buffer.from(body.signedBlob, "base64").toString("hex")}`;
  logUploadAuthStage("signed_url_created");
  return url.toString();
}

export async function createLegiscastOriginalUploadUrl(path: string, contentType: string) {
  const auth = getLegiscastGcpAuthClient();
  logUploadAuthStage("oidc_client_created");
  return createLegiscastV4UploadUrl(path, contentType, { auth, serviceAccount: required("GCP_SERVICE_ACCOUNT_EMAIL"), bucket: getLegiscastOriginalBucketName() });
}

function getLegiscastOriginalStorage() {
  const { Storage } = require("@google-cloud/storage") as { Storage: StorageConstructor };
  return new Storage({ projectId: getLegiscastGcpProjectId(), authClient: getLegiscastGcpAuthClient() });
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
