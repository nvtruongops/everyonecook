import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from '../base-stack';

/**
 * Certificate Stack for CloudFront and API Gateway
 *
 * This stack creates ACM certificates for CloudFront and API Gateway.
 *
 * IMPORTANT REGION REQUIREMENTS:
 * - CloudFront certificate: MUST be in us-east-1 (CloudFront requirement)
 * - API Gateway certificate: Should be in same region as API Gateway (ap-southeast-1)
 *
 * This stack is deployed in us-east-1 to handle CloudFront's cross-region requirements.
 * For API Gateway, we use a wildcard certificate that covers api.everyonecook.cloud.
 *
 * Responsibilities:
 * - Create ACM certificate for CloudFront in us-east-1
 * - Create ACM wildcard certificate for API Gateway in us-east-1 (works globally)
 * - Validate certificates via Route 53 DNS
 * - Export certificate ARNs for Core Stack and Backend Stack to use
 *
 * COST OPTIMIZATION NOTE:
 * - CloudFront WAF removed to save $9/month ($108/year)
 * - CloudFront still protected by Shield Standard (free, auto-enabled)
 * - API Gateway has full WAF protection (BackendStack)
 *
 * @see docs/phase-2/ACM-CLOUDFRONT-ANALYSIS.md - Technical analysis
 * @see .kiro/specs/project-restructure/security-architecture.md - WAF configuration
 */
export class CertificateStack extends BaseStack {
  public readonly cloudFrontCertificate: acm.ICertificate;
  public readonly apiGatewayCertificate: acm.ICertificate;

  constructor(scope: Construct, id: string, props: BaseStackProps) {
    super(scope, id, props);

    // Add stack-specific tags
    cdk.Tags.of(this).add('StackType', 'Certificate');
    cdk.Tags.of(this).add('Layer', 'Infrastructure');
    cdk.Tags.of(this).add('CostCenter', `Certificate-${this.config.environment}`);

    // Import Route 53 Hosted Zone from DNS Stack
    // Note: Cannot use Fn.importValue or SSM Parameter for cross-region references
    // Hosted Zone ID is stable and doesn't change, so we hardcode it
    // This value comes from DNS Stack output: Z018823421GWCSYG5UMHV
    const hostedZoneId = 'Z018823421GWCSYG5UMHV';

    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: hostedZoneId,
      zoneName: 'everyonecook.cloud',
    });

    // Create ACM certificate for CloudFront
    // This certificate MUST be in us-east-1 for CloudFront to use it
    this.cloudFrontCertificate = this.createCloudFrontCertificate(hostedZone);

    // Create ACM wildcard certificate for API Gateway
    // Wildcard *.everyonecook.cloud covers api.everyonecook.cloud
    // This certificate in us-east-1 can be used by API Gateway in any region
    this.apiGatewayCertificate = this.createApiGatewayCertificate(hostedZone);

    // COST OPTIMIZATION: CloudFront WAF removed
    // CloudFront is protected by Shield Standard (free, auto-enabled)
    // API Gateway has full WAF protection in BackendStack
    // Savings: $9/month ($108/year)

    // Export certificate ARNs
    this.exportOutputs();
  }

  /**
   * Create ACM certificate for CloudFront CDN
   *
   * CRITICAL: This stack MUST be deployed in us-east-1 region.
   * CloudFront is a global service but its control plane is in us-east-1,
   * so it can only access certificates from us-east-1.
   *
   * DNS validation is automatic via Route 53.
   * Validation typically takes 5-10 minutes.
   *
   * @param hostedZone - Route 53 Hosted Zone for DNS validation
   * @returns ACM Certificate for CloudFront
   */
  private createCloudFrontCertificate(hostedZone: route53.IHostedZone): acm.Certificate {
    const certificate = new acm.Certificate(this, 'CloudFrontCertificate', {
      domainName: this.config.domains.cdn,
      validation: acm.CertificateValidation.fromDns(hostedZone),
      certificateName: `EveryoneCook-CloudFront-${this.config.environment}`,
    });

    // Add tags
    cdk.Tags.of(certificate).add('Component', 'CloudFront');
    cdk.Tags.of(certificate).add('Purpose', 'CDN-SSL');

    return certificate;
  }

  /**
   * Create ACM wildcard certificate for API Gateway
   *
   * Creates a wildcard certificate (*.everyonecook.cloud) that covers:
   * - api.everyonecook.cloud (API Gateway)
   * - api-dev.everyonecook.cloud (API Gateway dev)
   * - api-staging.everyonecook.cloud (API Gateway staging)
   *
   * This certificate is created in us-east-1 but can be used by API Gateway
   * in any region via cross-region certificate reference.
   *
   * DNS validation is automatic via Route 53.
   * Validation typically takes 5-10 minutes.
   *
   * @param hostedZone - Route 53 Hosted Zone for DNS validation
   * @returns ACM Certificate for API Gateway
   */
  private createApiGatewayCertificate(hostedZone: route53.IHostedZone): acm.Certificate {
    const certificate = new acm.Certificate(this, 'ApiGatewayCertificate', {
      domainName: '*.everyonecook.cloud', // Wildcard covers api.everyonecook.cloud
      subjectAlternativeNames: ['everyonecook.cloud'], // Also covers root domain
      validation: acm.CertificateValidation.fromDns(hostedZone),
      certificateName: `EveryoneCook-API-${this.config.environment}`,
    });

    // Add tags
    cdk.Tags.of(certificate).add('Component', 'APIGateway');
    cdk.Tags.of(certificate).add('Purpose', 'API-SSL');

    return certificate;
  }

  /**
   * REMOVED: CloudFront WAF Web ACL (Cost Optimization)
   *
   * Decision: Remove CloudFront WAF to save $9/month ($108/year)
   *
   * Rationale:
   * - CloudFront serves static content only (low attack surface)
   * - CloudFront is protected by Shield Standard (free, auto-enabled)
   * - Shield Standard provides Layer 3/4 DDoS protection
   * - API Gateway has full WAF protection (Layer 7)
   * - Cost savings: $9/month = $108/year
   *
   * Protection Status:
   * - ✅ Shield Standard: DDoS protection (free)
   * - ✅ CloudFront OAC: Blocks direct S3 access
   * - ✅ Signed URLs: Private content protection
   * - ❌ WAF: Removed (cost optimization)
   *
   * @see .kiro/specs/project-restructure/security-architecture.md - Cost optimization
   */

  /**
   * Export stack outputs for cross-stack references
   *
   * Exports:
   * - CloudFrontCertificateArn: ACM Certificate ARN for CloudFront (us-east-1)
   * - ApiGatewayCertificateArn: ACM Certificate ARN for API Gateway (us-east-1)
   *
   * REMOVED: CloudFrontWebAclArn (cost optimization)
   */
  private exportOutputs(): void {
    // Export CloudFront certificate ARN for Core Stack
    new cdk.CfnOutput(this, 'CloudFrontCertificateArn', {
      value: this.cloudFrontCertificate.certificateArn,
      exportName: this.exportName('CloudFrontCertificateArn'),
      description: 'ACM Certificate ARN for CloudFront (us-east-1)',
    });

    // Export CloudFront certificate domain for verification
    new cdk.CfnOutput(this, 'CloudFrontCertificateDomain', {
      value: this.config.domains.cdn,
      description: 'Domain name for CloudFront certificate',
    });

    // Export API Gateway certificate ARN for Backend Stack
    new cdk.CfnOutput(this, 'ApiGatewayCertificateArn', {
      value: this.apiGatewayCertificate.certificateArn,
      exportName: this.exportName('ApiGatewayCertificateArn'),
      description: 'ACM Wildcard Certificate ARN for API Gateway (us-east-1)',
    });

    // Export API Gateway certificate domain for verification
    new cdk.CfnOutput(this, 'ApiGatewayCertificateDomain', {
      value: '*.everyonecook.cloud',
      description: 'Domain name for API Gateway certificate (wildcard)',
    });
  }
}
