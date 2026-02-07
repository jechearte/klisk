# Deployment (Google Cloud Run)

## Quick Deploy

```bash
# 1. Generate deployment files
klisk deploy init

# 2. Deploy
klisk deploy --region us-central1
```

---

## `klisk deploy init`

Generates deployment files in the project directory:

| File | Description |
|---|---|
| `Dockerfile` | Python 3.12 slim, installs deps, runs `klisk serve` on port 8080 |
| `.dockerignore` | Excludes `.venv/`, `__pycache__/`, `.env`, `.git/`, etc. |
| `requirements.txt` | Pinned to the built klisk wheel (auto-includes `[litellm]` if needed) |
| `klisk-*.whl` | Built wheel of the current klisk installation |

**LiteLLM auto-detection:** Scans `.py` files for `model="provider/..."` patterns. If non-OpenAI models are found, `requirements.txt` uses `klisk[litellm]`.

---

## `klisk deploy`

Deploys to Google Cloud Run.

**Options:**

| Flag | Description | Default |
|---|---|---|
| `--path/-p` | Project name or path | `.` (current dir) |
| `--service/-s` | Cloud Run service name | Slugified project name |
| `--region/-r` | GCP region | gcloud default |
| `--project` | GCP project ID | gcloud configured project |

**Prerequisite checks (automatic):**

1. gcloud CLI installed
2. gcloud authenticated (`gcloud auth login`)
3. GCP project configured
4. Billing enabled
5. Required APIs enabled:
   - `run.googleapis.com`
   - `cloudbuild.googleapis.com`
   - `artifactregistry.googleapis.com`
6. Cloud Build permissions:
   - `roles/storage.objectAdmin`
   - `roles/logging.logWriter`
   - `roles/artifactregistry.writer`
7. `.env` file has real API keys (warns if placeholders detected)

Missing APIs are auto-enabled (with confirmation). Missing permissions are auto-granted.

**Environment variables:** Reads `.env` and passes all non-placeholder values as `--set-env-vars` to Cloud Run.

---

## Output

On success:

```
  Deployed successfully!

  Chat:   https://my-agent-xxxxx-uc.a.run.app
  API:    https://my-agent-xxxxx-uc.a.run.app/api/chat
  Health: https://my-agent-xxxxx-uc.a.run.app/health

  Embed widget:
  <script src="https://my-agent-xxxxx-uc.a.run.app/widget.js"></script>
```

---

## Protecting Your Deployment

Set API keys in `.env` before deploying:

```env
KLISK_API_KEY=my-secret-key
```

These are passed as Cloud Run environment variables. See [production.md](production.md) for auth details.

---

## Troubleshooting

| Error | Fix |
|---|---|
| `gcloud not found` | `brew install google-cloud-sdk` (macOS) |
| `Not authenticated` | `gcloud auth login` |
| `No project configured` | `gcloud config set project YOUR_PROJECT_ID` |
| `Billing not enabled` | Enable at `console.cloud.google.com/billing` |
| `No Dockerfile found` | Run `klisk deploy init` first |
| Deploy fails | Re-run (permission propagation can take seconds) |
| Build timeout | Check build at `console.cloud.google.com/cloud-build/builds` |
