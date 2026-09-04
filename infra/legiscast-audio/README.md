# LegisCast Áudio V2 — infraestrutura

O original é privado no Cloud Storage e expira em até dois dias. O resultado é um M4A privado no bucket Supabase já usado pelo player. Não execute `provision.sh` sem preencher as variáveis, criar os secrets e revisar os IAM bindings.

## Região e custos

Use `us-east1` para bucket, Artifact Registry e Cloud Run Job, **desde que a região do projeto Supabase seja americana e compatível**. Antes do provisionamento, confirme-a no Dashboard Supabase: se estiver mais próxima de outra região americana, use a mesma região nos três recursos GCP para reduzir tráfego interno e latência.

Um job de 1 vCPU/1 GiB por cinco minutos custa tipicamente poucos milésimos de dólar antes da franquia; o armazenamento temporário de 100 MB por até dois dias é residual. Há variação por região e egress entre Google Cloud e Supabase. Configure alerta de orçamento antes do primeiro deploy.

## Autenticação

O app Next usa **Vercel OIDC + Google Workload Identity Federation**, sem JSON key persistente. Habilite OIDC em Vercel, crie um pool/provider OIDC e permita apenas o subject de produção do projeto Vercel. Configure na Vercel, somente server-side:

- `GCP_PROJECT_ID`
- `GCP_PROJECT_NUMBER`
- `GCP_SERVICE_ACCOUNT_EMAIL` (controle)
- `GCP_WORKLOAD_IDENTITY_POOL_ID`
- `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`
- `GCP_LEGISCAST_ORIGINAL_BUCKET`
- `GCP_LEGISCAST_CLOUD_RUN_JOB=legiscast-audio-worker`
- `GCP_LEGISCAST_REGION=us-east1`

O worker recebe `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` somente do Secret Manager. Nunca coloque nenhum destes valores no browser ou em `NEXT_PUBLIC_*`.

## Permissões mínimas

- `legiscast-control`: criar e consultar o objeto temporário, `iam.serviceAccounts.signBlob` via `roles/iam.serviceAccountTokenCreator` para URLs V4 e `run.jobs.runWithOverrides` no Job. Na primeira implantação, `roles/run.developer` pode ser restringido depois por papel customizado.
- `legiscast-worker`: `storage.objects.get`, `storage.objects.list`, `storage.objects.delete` no bucket temporário e `roles/secretmanager.secretAccessor` apenas nos dois secrets.
- conta de deploy: Artifact Registry Writer e Cloud Run Developer; não é a identidade de runtime.

## Build e deploy manual do worker

```bash
gcloud builds submit workers/legiscast-audio --tag us-east1-docker.pkg.dev/PROJECT/legiscast/legiscast-audio-worker:TAG
gcloud run jobs update legiscast-audio-worker --region us-east1 --image us-east1-docker.pkg.dev/PROJECT/legiscast/legiscast-audio-worker:TAG
```

O Job recebe exclusivamente o `job_id` como argumento. Ele executa `ffprobe`, depois `ffmpeg -ac 1 -c:a aac -b:a 64k -af loudnorm ... -movflags +faststart`; nenhum parâmetro FFmpeg vem do Admin ou do banco.
