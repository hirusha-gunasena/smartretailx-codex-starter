#!/usr/bin/env bash
set -euo pipefail

aws sts get-caller-identity
aws configure get region
node --version
npm --version
docker --version
npx cdk --version
