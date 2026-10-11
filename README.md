# Gangway

Gangway is a release gate. A release stays open until the unit, image, and manifest checks pass. One failed check blocks it.

Nothing in this repository creates cloud resources or deploys a cluster. CI runs the tests, builds the image, renders the manifests, and validates Terraform.

## Run it

```bash
npm test
docker compose up --build
```

The API listens on http://127.0.0.1:8080/health.

```bash
curl -s -X POST http://127.0.0.1:8080/v1/releases \
  -H 'content-type: application/json' \
  -d '{"service":"ledger","version":"1.4.0"}'
```

Record each check with `POST /v1/releases/{id}/evidence` and a body of `{"check":"unit","result":"pass"}`. The allowed checks are `unit`, `image`, and `manifests`. The release is `ready` only when all three are `pass`.

## What is included

| Path | Role |
|---|---|
| `src/server.mjs` | Release gate API |
| `test` | API behavior and delivery-file checks |
| `Dockerfile`, `compose.yaml` | Local image |
| `deploy/k8s` | Base manifests plus dev and prod overlays |
| `charts/gangway` | Helm chart for the same service |
| `deploy/terraform` | ECR repository and log group |
| `.github/workflows/check.yml` | Test, image smoke, manifest render, Terraform validate |

The Terraform root uses the AWS provider. `terraform apply` needs your own credentials and can create billable resources. This project does not run apply.
