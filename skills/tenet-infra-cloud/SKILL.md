---
name: tenet-infra-cloud
description: "Audits IaC and cloud risks: exposure, IAM wildcards, encryption, buckets, Kubernetes, and drift."
when_to_use: "Infrastructure audit, cloud security, Terraform review, Kubernetes security, IAM policy, storage bucket exposure, tenet infra-cloud"
model: opus
allowed-tools: Bash Read Grep Glob Write
---

# Tenet Infrastructure & Cloud

Audits source-controlled infrastructure configuration for cloud and platform risks. This complements `tenet-security` by focusing on deployed infrastructure boundaries rather than application code.

## Language Support Matrix

```yaml
support:
  native: [terraform, yaml, json, dockerfile]
  heuristic: [shell, markdown]
  skip: [typescript, javascript, python, go, rust, java]
```

## Toolchain Inputs

Prefer deterministic/static tool output when present:
- `.healthcheck/toolchain/tflint.json`
- `.healthcheck/toolchain/checkov.json`
- `.healthcheck/toolchain/tfsec.json`
- `.healthcheck/toolchain/kube_linter.json`
- `.healthcheck/toolchain/conftest.json`

## Procedure

### Step 0: Detect Applicability

Applicable when the repo contains Terraform, Pulumi, CloudFormation, Kubernetes manifests, Helm charts, Docker Compose, ECS/task definitions, or cloud deployment YAML.

If none exist, write `score: null`, `applicable: false`.

### Step 1: Public Exposure

Check for:
- `0.0.0.0/0`, `::/0`, public load balancers, public S3/storage buckets
- Kubernetes services of type `LoadBalancer` or ingress without host/TLS constraints
- Docker Compose `ports` exposing databases/cache publicly

Severity:
- `critical`: databases, admin panels, object storage, or internal services exposed publicly
- `major`: broad public ingress on app services without TLS/auth evidence
- `minor`: overly broad egress or management ports in dev-only configs

### Step 2: IAM and Secrets

Check IAM policies for wildcards, privileged roles, long-lived keys, secrets embedded in IaC, and CI roles with excessive permissions.

Severity:
- `critical`: `Action: "*"`, `Resource: "*"`, admin policies, or embedded cloud credentials
- `major`: broad service wildcards on production roles
- `minor`: missing condition keys or environment scoping

### Step 3: Encryption and Data Protection

Check storage, database, queue, and volume resources for encryption at rest, TLS, backup, and deletion protection.

Severity:
- `major`: production data store lacks encryption, backup, or deletion protection
- `minor`: non-production resource lacks encryption or lifecycle settings
- `info`: encryption exists but key ownership/rotation is not documented

### Step 4: Kubernetes and Container Security

Check manifests for:
- `privileged: true`, hostPath, hostNetwork, root user, missing resource limits
- missing readiness/liveness probes
- no network policy in namespaces with multiple services

Severity follows blast radius: `critical` for privileged host access, `major` for missing limits/probes/network isolation, `minor` for namespace hygiene.

### Step 5: Drift and Manual Infrastructure

If deployment docs mention manual console setup with no IaC equivalent, flag drift risk.

Severity:
- `major`: critical resources documented only as manual setup
- `minor`: non-critical manual setup not codified

### Step 6: Compile and Score

Every finding uses:
- `dimension: "infra-cloud"`
- `confidence: "deterministic"` for toolchain output, `native` for parsed IaC, `heuristic` for grep/doc checks
- `fix_prompt` following `shared/fix_prompt_template.md`
- `Line: N/A` in the `fix_prompt` and top-level `line: null` for cloud-account-level gaps without exact source lines
- Every `fix_prompt` Location section MUST include `- File:`, `- Line:`, and `- Dimension:` entries

## Output

- `.healthcheck/reports/infra-cloud.json`

## Constraints

- Treat examples and local-only Compose files more gently unless they are used by CI/deploy docs.
- Do not require cloud-provider APIs; this skill is repo evidence only.
- Deduplicate with `tenet-security`; keep IaC/cloud posture findings here.
