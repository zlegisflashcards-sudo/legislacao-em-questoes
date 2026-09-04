#!/usr/bin/env bash
set -euo pipefail

# Execute somente após preencher variáveis e revisar IAM. Não contém credenciais.
: "${GCP_PROJECT_ID:?}"
REGION="${GCP_LEGISCAST_REGION:-us-east1}"
BUCKET="${GCP_LEGISCAST_ORIGINAL_BUCKET:?}"
REPOSITORY="legiscast"
CONTROL_SA="legiscast-control@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
WORKER_SA="legiscast-worker@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

gcloud config set project "$GCP_PROJECT_ID"
gcloud services enable run.googleapis.com storage.googleapis.com artifactregistry.googleapis.com iamcredentials.googleapis.com secretmanager.googleapis.com
gcloud storage buckets create "gs://${BUCKET}" --location="$REGION" --uniform-bucket-level-access
gcloud storage buckets update "gs://${BUCKET}" --public-access-prevention
gcloud storage buckets update "gs://${BUCKET}" --cors-file="$(dirname "$0")/cors.json"
gcloud storage buckets update "gs://${BUCKET}" --lifecycle-file="$(dirname "$0")/lifecycle.json"
gcloud artifacts repositories create "$REPOSITORY" --repository-format=docker --location="$REGION" --description="LegisCast worker images" || true
gcloud iam service-accounts create legiscast-control --display-name="LegisCast Vercel control" || true
gcloud iam service-accounts create legiscast-worker --display-name="LegisCast FFmpeg worker" || true

# Controle: URL assinada de upload e disparo do Job. Restrinja estes papéis ao bucket/job abaixo.
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" --member="serviceAccount:${CONTROL_SA}" --role="roles/storage.objectCreator"
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" --member="serviceAccount:${CONTROL_SA}" --role="roles/storage.objectViewer"
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" --member="serviceAccount:${WORKER_SA}" --role="roles/storage.objectUser"
gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" --member="serviceAccount:${CONTROL_SA}" --role="roles/iam.serviceAccountTokenCreator"
gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" --member="serviceAccount:${WORKER_SA}" --role="roles/secretmanager.secretAccessor"

# Crie antes os secrets SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no Secret Manager.
gcloud run jobs create legiscast-audio-worker --region="$REGION" --image="${REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${REPOSITORY}/legiscast-audio-worker:REPLACE_TAG" --service-account="$WORKER_SA" --tasks=1 --max-retries=0 --task-timeout=20m --memory=1Gi --cpu=1 --set-env-vars="GCP_LEGISCAST_ORIGINAL_BUCKET=${BUCKET}" --set-secrets="SUPABASE_URL=SUPABASE_URL:latest,SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest"
gcloud run jobs add-iam-policy-binding legiscast-audio-worker --region="$REGION" --member="serviceAccount:${CONTROL_SA}" --role="roles/run.developer"

# WIF Vercel: configure pool/provider conforme README antes deste binding; substitua o principal exato.
# gcloud iam service-accounts add-iam-policy-binding "$CONTROL_SA" --role=roles/iam.workloadIdentityUser --member="principal://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/vercel/subject/owner:TEAM:project:PROJECT:environment:production"
