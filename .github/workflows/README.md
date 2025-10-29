# GitHub Actions Workflows for Ascintra

## Overview

Automated CI/CD pipelines for building, testing, and deploying Ascintra to AWS EKS.

---

## Workflows

### 1. Validate Builds (`validate-builds.yml`)

**Triggers**:
- Push to `main` or `develop` branch
- Pull requests to `main` or `develop`

**Actions**:
- Validates that all 9 Docker images can build successfully
- Does NOT push to ECR (validation only)
- Runs on every commit to catch build errors early

**Matrix Build**:
Validates all 9 services in parallel:
- discovery
- restore
- inventory
- cloud-accounts
- compliance
- drift
- posture
- api-gateway
- frontend

**Note**: Images are only built and pushed to ECR when a release tag is created.

---

### 2. Build and Release (`build-and-release.yml`)

**Triggers**:
- Git tag push matching `*.*.*.*.*` (e.g., `1.0.0.build.1`, `1.0.0.build.2`)

**Tag Format**: `x.x.x.build.x`
- `x.x.x` = Semantic version (e.g., 1.0.0, 1.0.1)
- `build.x` = Build number (e.g., build.1, build.2)
- **Example**: `1.0.0.build.1`, `1.2.3.build.5`

**Actions**:
1. **Build and Push**: Builds and pushes all images with the release tag
2. **Package Helm Charts**:
   - Updates Chart.yaml versions (uses full tag: x.x.x.build.x)
   - Updates values.yaml image tags (uses full tag: x.x.x.build.x)
   - Packages all 9 Helm charts
   - Creates GitHub Release with chart packages
3. **NO Automatic Deployment**:
   - Does NOT deploy to any environment
   - Deployment is a separate manual step

**Example**:
```bash
git tag -a 1.0.0.build.1 -m "Release 1.0.0 build 1"
git push origin 1.0.0.build.1
# → Automatically builds, packages, and creates release
# → Does NOT deploy (manual step required)
```

**Output**:
- Docker images in ECR: `ascintra/*:1.0.0.build.1`
- Helm charts in GitHub Release: `ascintra-*-1.0.0.build.1.tgz`
- GitHub Release created with instructions

---

### 3. Deploy to Production (`deploy-production.yml`)

**Triggers**:
- Manual trigger only (workflow_dispatch)

**Input Parameters**:
- `tag`: Version tag to deploy (e.g., `1.0.0.build.1`) - **Required**
- `namespace`: Kubernetes namespace (default: `ascintra`) - Optional

**Actions**:
1. Validates tag format (must be `x.x.x.build.x`)
2. Verifies images exist in ECR
3. Deploys selected version to production EKS cluster
4. Uses production Helm chart settings
5. Runs smoke tests

**How to Use**:
1. Go to GitHub Actions → Deploy to Production (Manual)
2. Click "Run workflow"
3. Enter tag (e.g., `1.0.0.build.1`)
4. Click "Run workflow"

**Production Cluster**:
- Cluster name: `ascintra-prod` (from secrets)
- Namespace: `ascintra` (default)
- Uses existing ECR images (no build)
- Full production resources and replicas

---

## Setup

### 1. GitHub Secrets

Add these secrets in: **Settings → Secrets and variables → Actions**

| Secret | Value | Example |
|--------|-------|---------|
| `AWS_ACCOUNT_ID` | AWS account ID | 123456789012 |
| `AWS_REGION` | AWS region | us-east-1 |
| `AWS_ACCESS_KEY_ID` | CI/CD user access key | AKIA... |
| `AWS_SECRET_ACCESS_KEY` | CI/CD user secret key | secret... |
| `EKS_CLUSTER_NAME` | Production cluster name | ascintra-prod |

### 2. AWS IAM User

Create IAM user with policies:
- ECR: Push/pull images
- EKS: Describe cluster
- (Optional) S3: Upload artifacts

See: [GITHUB_ACTIONS_CI_CD.md](../../kubernetes-deployment/GITHUB_ACTIONS_CI_CD.md#step-1-github-secrets-setup)

### 3. EKS Cluster

Ensure clusters exist:
- `ascintra-prod` (production)
- `ascintra-staging` (staging)

---

## Usage

### Validate Builds (Automatic)

```bash
# Push to main or develop
git checkout main
git push origin main

# GitHub Actions will:
# → Validate all 9 Docker images build successfully
# → No images pushed to ECR (validation only)
```

### Create Release (Build & Package Only)

```bash
# Tag format: x.x.x.build.x
git tag -a 1.0.0.build.1 -m "Release 1.0.0 build 1"
git push origin 1.0.0.build.1

# GitHub Actions will automatically:
# 1. Build 9 images (1.0.0.build.1)
# 2. Push to ECR
# 3. Package Helm charts (version 1.0.0.build.1)
# 4. Create GitHub Release with chart packages
# 5. Does NOT deploy (manual step required)
# Total time: ~10-15 minutes
```

### Deploy to Production (Manual)

**Via GitHub UI**:
1. Go to: GitHub → Actions → "Deploy to Production (Manual)"
2. Click "Run workflow"
3. Enter tag: `1.0.0.build.1`
4. Click "Run workflow"

**Via GitHub CLI**:
```bash
gh workflow run deploy-production.yml -f tag=1.0.0.build.1
```

**Images must exist in ECR first** (create a release tag first).

### Rollback Production

```bash
# Using Helm rollback
helm rollback ascintra-discovery -n ascintra

# Or deploy specific previous version
helm upgrade ascintra-discovery \
  ./helm-charts/discovery \
  --set image.tag=1.0.0.build.1 \
  -n ascintra
```

### Create Multiple Builds for Same Version

```bash
# First build
git tag -a 1.0.0.build.1 -m "Release 1.0.0 build 1"
git push origin 1.0.0.build.1

# Fix a bug, create second build
git tag -a 1.0.0.build.2 -m "Release 1.0.0 build 2 - Bug fix"
git push origin 1.0.0.build.2

# Each creates a new Helm chart:
# - ascintra-*-1.0.0.build.1.tgz
# - ascintra-*-1.0.0.build.2.tgz
```

---

## Monitoring

### View Workflow Status

**GitHub UI**:
- Repository → Actions tab
- Select workflow
- View logs for each job

**CLI** (GitHub CLI):
```bash
# Install gh CLI
brew install gh

# View workflow runs
gh run list

# View specific run
gh run view <run-id>

# View logs
gh run view <run-id> --log
```

### Notifications

**Slack** (optional):
Add to workflow:
```yaml
- name: Notify Slack
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

---

## Workflow Diagram

```
┌─────────────────────────┐
│     Developer           │
└───────────┬─────────────┘
            │
            ├─ Push to main/develop ──────────┐
            │                                  │
            │                                  ▼
            │                         ┌────────────────┐
            │                         │ Validate Build │
            │                         │  (No ECR Push) │
            │                         └────────────────┘
            │
            │
            └─ Create tag 1.0.0.build.1 ──────┐
                                               │
                                               ▼
                                      ┌──────────────────┐
                                      │  Build & Release │
                                      │  (NO Deployment) │
                                      └────────┬─────────┘
                                               │
                                               ├─ Build images ────────┐
                                               │                       │
                                               ├─ Push to ECR ─────────┤
                                               │                       │
                                               ├─ Package Helm ────────┤
                                               │                       │
                                               └─ GitHub Release ──────┤
                                                                       │
                                                                       ▼
                                              ┌────────────────────────────┐
                                              │ ECR: 1.0.0.build.1         │
                                              │ Release: Charts + Assets    │
                                              │ Helm: 1.0.0.build.1.tgz     │
                                              └────────────────────────────┘

Manual Production Deployment:
──────────────────────────────
GitHub UI → Actions → Deploy to Production → Select Tag → Deploy to EKS
```

---

## Troubleshooting

### Build Failures

**Issue**: `error building image`

**Fix**:
```bash
# Check Dockerfile syntax
docker build -f services/discovery/Dockerfile services/discovery

# Check paths in workflow
cat .github/workflows/build-and-push.yml
```

### Push Failures

**Issue**: `denied: Your authorization token has expired`

**Fix**:
- Refresh AWS credentials in GitHub Secrets
- Check IAM permissions for ECR

### Deployment Failures

**Issue**: `helm upgrade failed`

**Fix**:
```bash
# Check cluster connection
kubectl cluster-info

# Check pod status
kubectl get pods -n ascintra

# Check Helm release
helm list -n ascintra

# View pod logs
kubectl logs <pod-name> -n ascintra
```

### Image Pull Errors

**Issue**: `ImagePullBackOff` in EKS

**Fix**:
```bash
# Verify image exists in ECR
aws ecr list-images --repository-name ascintra/discovery

# Check ECR permissions for EKS nodes
# Ensure EKS node role has ECR pull permissions
```

---

## Best Practices

### 1. Version Control

- Use semantic versioning: `v1.0.0`, `v1.0.1`, `v2.0.0`
- Tag after merging to main
- Include release notes in tag message

### 2. Testing

- Test in staging before creating release tag
- Run smoke tests after staging deployment
- Verify health endpoints

### 3. Rollback Strategy

- Keep previous Helm releases (default: 10)
- Use `helm rollback` for quick recovery
- Test rollback procedure regularly

### 4. Security

- Rotate AWS credentials regularly
- Use least-privilege IAM policies
- Enable ECR image scanning
- Review security findings

### 5. Cost Optimization

- Use spot instances for staging
- Reduce staging replicas (2 instead of 3)
- Clean up old ECR images (lifecycle policy)
- Stop staging environment during off-hours

---

## Next Steps

1. **Setup GitHub Secrets**: Add AWS credentials
2. **Test Build**: Push to develop and verify build
3. **Test Staging**: Verify staging deployment
4. **Create Release**: Create v1.0.0 tag
5. **Monitor**: Check production deployment

---

## Links

- [Main Deployment Guide](../../kubernetes-deployment/README.md)
- [EKS Production Deployment](../../kubernetes-deployment/EKS_PRODUCTION_DEPLOYMENT.md)
- [GitHub Actions CI/CD Guide](../../kubernetes-deployment/GITHUB_ACTIONS_CI_CD.md)
- [Helm Charts](../../kubernetes-deployment/helm-charts/)

---

**Last Updated**: October 16, 2025  
**Status**: ✅ Production Ready
