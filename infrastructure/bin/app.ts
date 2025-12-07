#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { getConfig } from '../config/environment';

/**
 * Everyone Cook CDK Application
 *
 * Entry point for AWS CDK infrastructure deployment
 * Supports multiple environments: dev, staging, prod
 *
 * Usage:
 *   cdk deploy --context environment=dev
 *   cdk deploy --context environment=staging
 *   cdk deploy --context environment=prod
 */

const app = new cdk.App();

// Get environment from context (default to 'dev')
const environment = app.node.tryGetContext('environment') || 'dev';
const config = getConfig(environment);

console.log(`🚀 Deploying Everyone Cook infrastructure for environment: ${environment}`);
console.log(`📧 Contact: ${config.contact.email}`);
console.log(`🌐 Frontend: https://${config.domains.frontend}`);
console.log(`🔌 API: https://${config.domains.api}`);
console.log(`📦 CDN: https://${config.domains.cdn}`);

// Stack naming convention: EveryoneCook-{Environment}-{StackName}
const stackPrefix = `EveryoneCook-${config.environment}`;

// Import stacks
import { DnsStack } from '../lib/stacks/dns-stack';
import { CertificateStack } from '../lib/stacks/certificate-stack';
import { CoreStack } from '../lib/stacks/core-stack';
import { AuthStack } from '../lib/stacks/auth-stack';
import { BackendStack } from '../lib/stacks/backend-stack';
// TODO: Import other stacks as they are created
// import { SecurityStack } from '../lib/stacks/security-stack';
// import { FrontendStack } from '../lib/stacks/frontend-stack';
import { ObservabilityStack } from '../lib/stacks/observability-stack'; // Phase 7

// Phase 1: DNS Stack (Route 53 Hosted Zone only)
// This must be deployed FIRST before other stacks
// After deployment, update nameservers at Hostinger to Route 53 nameservers
// Note: SES Email Identity is managed by AuthStack (Phase 3)
const dnsStack = new DnsStack(app, `${stackPrefix}-DNS`, {
  env: {
    account: config.account,
    region: config.region,
  },
  config,
  description: `DNS infrastructure (Route 53 Hosted Zone) for Everyone Cook (${config.environment})`,
});

// Phase 1.5: Certificate Stack (ACM Certificate for CloudFront in us-east-1)
// CRITICAL: This stack MUST be deployed in us-east-1 region
// CloudFront requires certificates to be in us-east-1
const certificateStack = new CertificateStack(app, `${stackPrefix}-Certificate`, {
  env: {
    account: config.account,
    region: 'us-east-1', // MUST be us-east-1 for CloudFront
  },
  config,
  description: `ACM Certificate for CloudFront (${config.environment}) - us-east-1`,
});
certificateStack.addDependency(dnsStack); // Needs Hosted Zone for DNS validation

// Phase 2: Core Stack (DynamoDB, S3, CloudFront, KMS)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const coreStack = new CoreStack(app, `${stackPrefix}-Core`, {
  env: {
    account: config.account,
    region: config.region,
  },
  config,
  description: `Core infrastructure for Everyone Cook (${config.environment})`,
});
coreStack.addDependency(certificateStack); // Needs certificate for CloudFront

// Phase 3: Auth Stack (Cognito, SES)
const authStack = new AuthStack(app, `${stackPrefix}-Auth`, {
  env: {
    account: config.account,
    region: config.region,
  },
  config,
  dynamoTable: coreStack.table,
  description: `Authentication infrastructure for Everyone Cook (${config.environment})`,
});
authStack.addDependency(coreStack);
// Note: AuthStack will create its own SES Email Identity with DKIM records

// Phase 4: Backend Stack (API Gateway, Lambda functions)
const backendStack = new BackendStack(app, `${stackPrefix}-Backend`, {
  env: {
    account: config.account,
    region: config.region,
  },
  config,
  dynamoTable: coreStack.table,
  contentBucket: coreStack.contentBucket,
  distribution: coreStack.distribution,
  userPool: authStack.userPool,
  userPoolClient: authStack.userPoolClient,
  description: `Backend services for Everyone Cook (${config.environment})`,
});
backendStack.addDependency(authStack);

// Phase 5: Security Stack (WAF, Shield, Security Hub)
// const securityStack = new SecurityStack(app, `${stackPrefix}-Security`, {
//   env: {
//     account: config.account,
//     region: config.region,
//   },
//   config,
//   backendStack,
//   description: `Security infrastructure for Everyone Cook (${config.environment})`,
// });
// securityStack.addDependency(backendStack);

// Phase 6: Frontend Stack (Amplify)
// const frontendStack = new FrontendStack(app, `${stackPrefix}-Frontend`, {
//   env: {
//     account: config.account,
//     region: config.region,
//   },
//   config,
//   backendStack,
//   description: `Frontend hosting for Everyone Cook (${config.environment})`,
// });
// frontendStack.addDependency(backendStack);

// Phase 7: Observability Stack (CloudWatch Dashboards & Alarms)
const observabilityStack = new ObservabilityStack(app, `${stackPrefix}-Observability`, {
  env: {
    account: config.account,
    region: config.region,
  },
  config,
  coreStack,
  authStack,
  backendStack,
  description: `Observability infrastructure for Everyone Cook (${config.environment})`,
});
observabilityStack.addDependency(backendStack);

// Add tags to all stacks
cdk.Tags.of(app).add('Project', 'EveryoneCook');
cdk.Tags.of(app).add('Environment', config.environment);
cdk.Tags.of(app).add('ManagedBy', 'CDK');
cdk.Tags.of(app).add('Contact', config.contact.email);
cdk.Tags.of(app).add('Repository', config.contact.repository);

app.synth();
