---
name: tenet-infra-cloud
description: "Audits IaC and cloud risks: exposure, IAM wildcards, encryption, buckets, Kubernetes, and drift."
when_to_use: "tenet infra-cloud, tenet-infra-cloud dimension, Tenet infrastructure and cloud audit. Run via /tenet-skills:tenet-orchestrator or directly with /tenet-skills:tenet-infra-cloud."
model: sonnet
disable-model-invocation: true
allowed-tools: Bash Read Grep Glob Write
---

# Tenet Infrastructure & Cloud

Audits source-controlled infrastructure configuration for cloud and platform risks. This complements `tenet-security` by focusing on deployed infrastructure boundaries rather than application code.

## Calibration — read first

Follow `shared/scan-discipline.md` (complete every step, enumerate rather than sample, and §2a:
report only issues that actually exist), `shared/verification.md` (every finding is confirmed
against the code before it ships; unconfirmed candidates are dropped, not demoted), and
`shared/severity.md` (severity is confirmed impact, never a hedge for doubt).

A finding must exist in this codebase on a path that can run. Do not report hypotheticals, dead
code, style preferences, or anything an upstream check already prevents. Zero findings for a step
is the normal result on healthy code; do not fill a step to show you looked. Do not overthink it:
read the code and its context, decide, move on.

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

```bash
git ls-files -- '*.tf' '*.tfvars' '*Pulumi.*' '*cloudformation*' '*template.y*ml' '*k8s/*' '*kubernetes/*' '*helm/*' '*Chart.yaml' '*docker-compose*' '*compose.y*ml' '*Dockerfile*' '*task-definition*' '*serverless.y*ml' '*fly.toml' '*render.yaml' | head -80
```

If none exist, write `score: null`, `applicable: false`.

**Where it runs.** Before judging exposure, establish from the README, deploy docs and config
whether the target is a public cloud, or a private network such as a home server or LAN-only
host with no tunnel or port forward. Record it in `notes`. An open port means different things in
each.

**Project scale.** Classify the project per `shared/project-scale.md` before scoring anything. Findings
marked *(scaled)* below are `info` at `solo` scale and keep the listed severity at `team` scale.


### Step 1: Public Exposure

```bash
git grep -nP "0\.0\.0\.0/0|::/0|publicly_accessible\s*=\s*true|acl\s*=\s*\"public-read|block_public_(acls|policy)\s*=\s*false|type:\s*LoadBalancer|hostNetwork:\s*true" -- '*.tf' '*.tfvars' '*.yaml' '*.yml' '*.json'
git grep -nP "^\s*-\s*['\"]?(\d{1,3}(\.\d{1,3}){3}:)?\d+:(5432|3306|27017|6379|9200|5984|11211|2375|9000)\b" -- '*docker-compose*' '*compose.y*ml'
```

Check for:
- `0.0.0.0/0`, `::/0`, public load balancers, public S3/storage buckets
- Kubernetes services of type `LoadBalancer` or ingress without host/TLS constraints
- Docker Compose `ports` exposing databases/cache publicly

Severity:
- `critical`: databases, admin panels, object storage, or internal services exposed publicly. On a private-network target (see Step 0), a database or cache port published by Compose is reachable by every device on that network, not the internet: `minor`, and not a finding at all when the mapping binds to `127.0.0.1`
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
- `major`: critical resources documented only as manual setup *(scaled)*
- `minor`: non-critical manual setup not codified *(scaled)*

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
