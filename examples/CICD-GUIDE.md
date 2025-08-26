# CI/CD Integration Guide for Encrypted JSON Files

This guide explains how to integrate JSON encryption with CI/CD pipelines when **original JSON files are not committed** to the repository.

## 🏗️ Architecture Overview

```
Development → Encryption → Repository (.enc files) → CI/CD → Decryption → Deployment
```

### Key Principles:
1. **Development**: Work with unencrypted `.json` files locally
2. **Repository**: Store only `.enc` files (encrypted)
3. **CI/CD**: Decrypt `.enc` files during build/deployment
4. **Runtime**: Use decrypted `.json` files in production

## 🚀 Deployment Strategies

### Strategy 1: Runtime Decryption
**Best for**: Applications that can decrypt files at startup

```javascript
// app.js - Decrypt configs at application startup
const { execSync } = require('child_process');
const fs = require('fs');

// Decrypt configuration files on startup
function decryptConfigs() {
    console.log('🔓 Decrypting configuration files...');
    
    // Find all .enc files
    const encFiles = execSync('find ./config -name "*.enc"', { encoding: 'utf8' })
        .trim().split('\n').filter(Boolean);
    
    encFiles.forEach(file => {
        const dir = require('path').dirname(file);
        execSync(`npx json-batch-decrypt "${dir}" --overwrite`, {
            env: { ...process.env, ENC_SECRET: process.env.ENCRYPTION_SECRET }
        });
    });
    
    console.log('✅ Configuration files decrypted');
}

// Decrypt on startup
decryptConfigs();

// Load your configs
const config = require('./config/app.json');
const secrets = require('./config/secrets.json');
```

### Strategy 2: Build-time Decryption
**Best for**: Static builds, Docker containers, serverless functions

```yaml
# .github/workflows/deploy.yml
name: Build and Deploy

on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Decrypt configuration files
        run: |
          # Decrypt all .enc files
          find . -name "*.enc" | while read file; do
            dir=$(dirname "$file")
            npx json-batch-decrypt "$dir" --overwrite
          done
        env:
          ENC_SECRET: ${{ secrets.ENCRYPTION_SECRET }}
          
      - name: Build application
        run: npm run build
        
      - name: Deploy
        run: |
          # Deploy with decrypted configs
          # Configs are now available as .json files
```

### Strategy 3: External Secret Management
**Best for**: Enterprise environments, Kubernetes, cloud platforms

```yaml
# kubernetes-deployment.yml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  template:
    spec:
      initContainers:
      - name: decrypt-configs
        image: node:18-alpine
        command: ["/bin/sh"]
        args:
          - -c
          - |
            npm install -g json-encrypt-cli
            find /encrypted-configs -name "*.enc" | while read file; do
              dir=$(dirname "$file")
              npx json-batch-decrypt "$dir" --overwrite
            done
            cp /encrypted-configs/*.json /shared-configs/
        env:
        - name: ENC_SECRET
          valueFrom:
            secretKeyRef:
              name: encryption-secret
              key: secret
        volumeMounts:
        - name: encrypted-configs
          mountPath: /encrypted-configs
        - name: shared-configs
          mountPath: /shared-configs
      
      containers:
      - name: app
        image: myapp:latest
        volumeMounts:
        - name: shared-configs
          mountPath: /app/config
      
      volumes:
      - name: encrypted-configs
        configMap:
          name: encrypted-configs
      - name: shared-configs
        emptyDir: {}
```

## 🔧 Implementation Examples

### GitHub Actions

**Basic deployment workflow:**
```yaml
# .github/workflows/deploy.yml
name: Deploy with Decryption
on:
  push:
    branches: [main, develop]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: npm ci
      - name: Decrypt configuration
        run: npx json-batch-decrypt . --recursive
        env:
          ENCRYPTION_SECRET: ${{ secrets.ENCRYPTION_SECRET }}
      - name: Build application
        run: npm run build
      - name: Deploy
        run: # Your deployment commands
      - name: Cleanup
        run: find . -name "*.json" -not -path "./node_modules/*" -delete
        if: always()
```

### Azure DevOps Pipeline

**Basic deployment pipeline:**
```yaml
# azure-pipelines.yml
trigger:
  branches:
    include: [main, develop]

variables:
  - group: 'encryption-secrets'

stages:
  - stage: Deploy
    jobs:
      - job: DecryptAndDeploy
        pool:
          vmImage: 'ubuntu-latest'
        steps:
          - checkout: self
          - task: NodeTool@0
            inputs:
              versionSpec: '18.x'
          - script: npm ci
          - script: |
              npx json-batch-decrypt . --recursive
            env:
              ENCRYPTION_SECRET: $(ENCRYPTION_SECRET)
          - script: npm run build
          - script: # Your deployment commands
          - script: |
              find . -name "*.json" -not -path "./node_modules/*" -delete
            condition: always()
```

### GitHub Actions with Multiple Environments

```yaml
# .github/workflows/multi-env-deploy.yml
name: Multi-Environment Deployment

on:
  push:
    branches: [main, staging, production]

jobs:
  deploy:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        environment: 
          - ${{ github.ref == 'refs/heads/main' && 'development' || '' }}
          - ${{ github.ref == 'refs/heads/staging' && 'staging' || '' }}
          - ${{ github.ref == 'refs/heads/production' && 'production' || '' }}
        exclude:
          - environment: ''
    
    environment: ${{ matrix.environment }}
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Decrypt configs for ${{ matrix.environment }}
        run: |
          # Decrypt environment-specific configs
          if [ -d "config/${{ matrix.environment }}" ]; then
            npx json-batch-decrypt "config/${{ matrix.environment }}" --recursive --overwrite
          fi
          
          # Decrypt common configs
          if [ -d "config/common" ]; then
            npx json-batch-decrypt "config/common" --recursive --overwrite
          fi
        env:
          ENC_SECRET: ${{ secrets[format('ENCRYPTION_SECRET_{0}', matrix.environment)] }}
```

### Docker Multi-stage Build

```dockerfile
# Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

# Copy source and encrypted configs
COPY . .

# Decrypt configs during build
ARG ENC_SECRET
RUN echo "ENC_SECRET=${ENC_SECRET}" > .env && \
    find . -name "*.enc" -exec dirname {} \; | sort -u | \
    xargs -I {} npx json-batch-decrypt {} --overwrite

# Build application
RUN npm run build

# Production stage
FROM node:18-alpine AS production
WORKDIR /app

# Copy built application and decrypted configs
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/config/*.json ./config/
COPY --from=builder /app/package*.json ./

RUN npm ci --only=production

CMD ["npm", "start"]
```

### AWS Lambda Deployment

```yaml
# .github/workflows/lambda-deploy.yml
name: Deploy to AWS Lambda

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
          
      - name: Decrypt and package
        run: |
          # Install dependencies
          npm ci
          
          # Decrypt configs
          npx json-batch-decrypt config --recursive --overwrite
          
          # Package for Lambda
          zip -r function.zip . -x "*.enc" "*.git*" "node_modules/dev-*"
          
      - name: Deploy to Lambda
        run: |
          aws lambda update-function-code \
            --function-name my-function \
            --zip-file fileb://function.zip
```

## 🔐 Security Best Practices

### 1. Secret Management
```bash
# Use environment-specific secrets
ENCRYPTION_SECRET_DEV="dev-secret-key"
ENCRYPTION_SECRET_STAGING="staging-secret-key"
ENCRYPTION_SECRET_PROD="production-secret-key"
```

### 2. Cleanup After Decryption
```bash
# Always cleanup decrypted files in CI/CD
trap 'find . -name "*.json" -delete' EXIT
```

### 3. Verify Decryption
```bash
# Verify JSON validity after decryption
find . -name "*.json" | while read file; do
  if ! jq empty "$file" 2>/dev/null; then
    echo "Invalid JSON: $file"
    exit 1
  fi
done
```

## 📋 Workflow Checklist

- [ ] **Development**: Keep `.json` files in `.gitignore`
- [ ] **Encryption**: Use pre-commit hooks to encrypt sensitive files
- [ ] **Repository**: Store only `.enc` files
- [ ] **CI/CD**: Decrypt files during build/deployment
- [ ] **Secrets**: Use proper secret management (GitHub Secrets, AWS Secrets Manager, etc.)
- [ ] **Cleanup**: Remove decrypted files after deployment
- [ ] **Verification**: Validate JSON integrity after decryption
- [ ] **Environment**: Use different encryption keys per environment

## 🚨 Common Pitfalls

1. **Forgetting to cleanup**: Always remove decrypted files after use
2. **Wrong secret scope**: Use environment-specific encryption keys
3. **Missing verification**: Always validate decrypted JSON files
4. **Hardcoded secrets**: Never hardcode encryption keys in workflows
5. **Insufficient permissions**: Ensure CI/CD has access to required secrets

## 📚 Additional Resources

- [GitHub Actions Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Docker Secrets](https://docs.docker.com/engine/swarm/secrets/)
- [Kubernetes Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)
- [AWS Secrets Manager](https://aws.amazon.com/secrets-manager/)