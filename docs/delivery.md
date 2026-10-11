# Delivery path

Gangway records whether a release has the three checks this repository can actually run: unit tests, an image smoke, and rendered manifests.

The Service `gangway` selects pods labeled `app: gangway`. The Deployment uses that same label. Probes call `/ready` and `/health` on port 8080. The dev overlay runs one replica. The prod overlay runs two replicas and keeps one available during disruption.

Helm renders the same selector, port, and probes from `charts/gangway`. Terraform declares an immutable ECR repository and a log group. `terraform apply` is not part of CI. The workflow builds the image and checks `/health` on the runner. It does not push the image and it does not deploy a cluster.
