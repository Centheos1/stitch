#!/usr/bin/env node
import * as path from "path";
import * as cdk from "aws-cdk-lib";
import { CertificateStack } from "../lib/certificate-stack";
import { ApiStack } from "../lib/api-stack";
import { EdgeStack } from "../lib/edge-stack";
import { GithubOidcStack } from "../lib/github-oidc-stack";

const app = new cdk.App();

const domainName = "stitchhandmade.shop";
const account = process.env.CDK_DEFAULT_ACCOUNT;

// Certificate must live in us-east-1 for CloudFront.
const certificate = new CertificateStack(app, "StitchCertificateStack", {
  env: { account, region: "us-east-1" },
  domainName,
  description: `TLS certificate for ${domainName} (used by CloudFront)`,
});

// Express API on ECS Express Mode.
const apiStack = new ApiStack(app, "StitchApiStack", {
  env: { account, region: "ap-southeast-2" },
  crossRegionReferences: true,
  description: "STITCH API on ECS Express Mode",
});

// CloudFront, S3 site bucket, site upload, and DNS records.
new EdgeStack(app, "StitchEdgeStack", {
  env: { account, region: "us-east-1" },
  crossRegionReferences: true,
  description: `STITCH site and CDN for ${domainName}`,
  domainName,
  certificate: certificate.certificate,
  apiOrigin: apiStack.serviceEndpoint,
  siteBuildPath: path.resolve(__dirname, "../../dist/public"),
});

// Lets GitHub Actions deploy from main without stored AWS keys.
new GithubOidcStack(app, "StitchGithubOidcStack", {
  env: { account, region: "ap-southeast-2" },
  description: "GitHub Actions OIDC deploy role for STITCH",
  repository: "Centheos1/stitch",
  ownerId: "23650906",
  repositoryId: "1444934289",
  branch: "main",
});
