import "server-only";
import { createHash } from "node:crypto";

const REGION = "us-east1";
type IdentityPoolClientConstructor = new (options: Record<string, unknown>) => any;
type AuthDependencies = { IdentityPoolClient: IdentityPoolClientConstructor; getVercelOidcToken: () => Promise<string> };
type FederatedAuthClient = { getAccessToken: () => Promise<unknown> };
type FetchLike = (input: string, init: RequestInit) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
type V4UploadDependencies = { auth: FederatedAuthClient; serviceAccount: string; bucket: string; jobId?: string; now?: Date; fetchImpl?: FetchLike };
type MetadataLookupDependencies = { auth: FederatedAuthClient; bucket: string; jobId?: string; fetchImpl?: FetchLike };
type CloudRunDependencies = { auth: FederatedAuthClient; projectId: string; region: string; jobName: string; fetchImpl?: FetchLike };

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
  console.info("legiscast_original_upload_path", { jobId: dependencies.jobId, bucket: dependencies.bucket, originalStoragePath: path, signingPathname: parts.canonicalUri, finalUrlPathname: url.pathname });
  return url.toString();
}

export async function createLegiscastOriginalUploadUrl(path: string, contentType: string, jobId?: string) {
  const auth = getLegiscastGcpAuthClient();
  logUploadAuthStage("oidc_client_created");
  return createLegiscastV4UploadUrl(path, contentType, { auth, serviceAccount: required("GCP_SERVICE_ACCOUNT_EMAIL"), bucket: getLegiscastOriginalBucketName(), jobId });
}

export function createLegiscastOriginalMetadataUrl(bucket: string, path: string) {
  return new URL(`https://storage.googleapis.com/storage/v1/b/${rfc3986(bucket)}/o/${rfc3986(path)}`);
}

export async function getLegiscastOriginalMetadata(path: string, dependencies?: MetadataLookupDependencies) {
  const options: MetadataLookupDependencies = dependencies ?? { auth: getLegiscastGcpAuthClient(), bucket: getLegiscastOriginalBucketName() };
  const url = createLegiscastOriginalMetadataUrl(options.bucket, path);
  try {
    const token = accessToken(await options.auth.getAccessToken());
    const response = await (options.fetchImpl ?? fetch)(url.toString(), { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    console.info("legiscast_original_metadata_lookup", { jobId: options.jobId, bucket: options.bucket, originalStoragePath: path, metadataPathname: url.pathname, status: response.status });
    if (!response.ok) {
      const error = new Error(`Não foi possível consultar o original (${response.status}).`);
      Object.assign(error, { code: response.status });
      throw error;
    }
    return response.json() as Promise<{ size?: string | number | null; contentType?: string | null }>;
  } catch (error) {
    if (!(error instanceof Error && typeof (error as { code?: unknown }).code === "number")) console.error("legiscast_original_metadata_lookup_failed", { jobId: options.jobId, bucket: options.bucket, originalStoragePath: path, metadataPathname: url.pathname, errorName: error instanceof Error ? error.name : "UnknownError" });
    throw error;
  }
}

function safeCloudRunMessage(value: unknown) {
  return String(value ?? "Falha sem mensagem.").replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]").replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted-jwt]").slice(0, 500);
}

function logCloudRunStart(jobId: string, options: CloudRunDependencies, status?: number, errorCode?: number | string, sanitizedMessage?: string) {
  console.info("legiscast_cloud_run_start", { jobId, projectId: options.projectId, region: options.region, jobName: options.jobName, status, errorCode, sanitizedMessage });
}

export async function runLegiscastCloudRunJob(jobId: string, dependencies?: CloudRunDependencies) {
  const options: CloudRunDependencies = dependencies ?? { auth: getLegiscastGcpAuthClient(), projectId: getLegiscastGcpProjectId(), region: getLegiscastCloudRunRegion(), jobName: getLegiscastCloudRunJobName() };
  try {
    const token = accessToken(await options.auth.getAccessToken());
    const endpoint = `https://run.googleapis.com/v2/projects/${encodeURIComponent(options.projectId)}/locations/${encodeURIComponent(options.region)}/jobs/${encodeURIComponent(options.jobName)}:run`;
    const response = await (options.fetchImpl ?? fetch)(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ overrides: { containerOverrides: [{ args: [jobId] }] } }),
      cache: "no-store",
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => undefined) as { error?: { code?: unknown; status?: unknown; message?: unknown } } | undefined;
      const errorCode = typeof payload?.error?.code === "number" || typeof payload?.error?.code === "string" ? payload.error.code : response.status;
      const message = safeCloudRunMessage(payload?.error?.message ?? payload?.error?.status ?? `HTTP ${response.status}`);
      logCloudRunStart(jobId, options, response.status, errorCode, message);
      const error = new Error(`Não foi possível iniciar o processamento (${response.status}).`);
      Object.assign(error, { code: errorCode, status: response.status });
      throw error;
    }
    logCloudRunStart(jobId, options, response.status);
    return response.json() as Promise<unknown>;
  } catch (error) {
    if (!(error instanceof Error && typeof (error as { status?: unknown }).status === "number")) logCloudRunStart(jobId, options, undefined, typeof (error as { code?: unknown })?.code === "string" || typeof (error as { code?: unknown })?.code === "number" ? (error as { code: number | string }).code : undefined, safeCloudRunMessage(error instanceof Error ? error.message : undefined));
    throw error;
  }
}
