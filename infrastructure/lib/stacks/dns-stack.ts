import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from '../base-stack';

/**
 * DNS Stack for Everyone Cook Infrastructure
 *
 * This stack manages ONLY the Route 53 Hosted Zone for everyonecook.cloud domain.
 * It provides the foundation DNS infrastructure that other stacks depend on.
 *
 * Responsibilities:
 * - Create and manage Route 53 Hosted Zone
 * - Export Hosted Zone ID and Name for cross-stack references
 * - Provide nameservers for domain delegation from Hostinger
 *
 * What This Stack Does NOT Include:
 * - SES Email Identity (managed by AuthStack - Phase 3)
 * - DKIM/SPF/DMARC records (managed by AuthStack - Phase 3)
 * - ACM Certificates (managed by CertificateStack - Phase 1.5)
 * - Application DNS records (managed by respective stacks)
 *
 * Deployment Order: This is the FIRST stack to deploy (Phase 1)
 *
 * Post-Deployment Action Required:
 * After deployment, you MUST update nameservers at Hostinger hPanel
 * to delegate DNS management to Route 53.
 *
 * @see .kiro/specs/project-restructure/dns-architecture.md - Complete DNS strategy
 * @see .kiro/specs/project-restructure/requirements.md - Req 6 (CDK Stack Strategy)
 */
export class DnsStack extends BaseStack {
  // Route 53 Hosted Zone
  public readonly hostedZone: cdk.aws_route53.IHostedZone;

  constructor(scope: Construct, id: string, props: BaseStackProps) {
    super(scope, id, props);

    // Add stack-specific tags
    cdk.Tags.of(this).add('StackType', 'DNS');
    cdk.Tags.of(this).add('Layer', 'Foundation');
    cdk.Tags.of(this).add('CostCenter', `DNS-${this.config.environment}`);

    // Create Route 53 Hosted Zone
    this.hostedZone = this.createHostedZone();

    // Export stack outputs
    this.exportOutputs();
  }

  /**
   * Create Route 53 Hosted Zone for everyonecook.cloud
   *
   * This creates a public hosted zone that will manage all DNS records for the domain.
   * After creation, you must update nameservers at Hostinger to point to Route 53.
   *
   * Cost: $0.50/month per hosted zone + $0.40 per million queries
   *
   * @returns Route 53 Hosted Zone
   */
  private createHostedZone(): cdk.aws_route53.IHostedZone {
    // Get root domain from environment config
    const rootDomain = this.config.domains.frontend.replace(/^(dev\.|staging\.)/, '');

    const hostedZone = new cdk.aws_route53.PublicHostedZone(this, 'HostedZone', {
      zoneName: rootDomain,
      comment: `Hosted Zone for Everyone Cook ${this.config.environment} environment`,
    });

    // Add tags
    cdk.Tags.of(hostedZone).add('Component', 'DNS');
    cdk.Tags.of(hostedZone).add('ManagedBy', 'CDK');

    return hostedZone;
  }

  /**
   * Export stack outputs for cross-stack references
   *
   * Exports:
   * - HostedZoneId: Route 53 Hosted Zone ID (for other stacks to create DNS records)
   * - HostedZoneName: Domain name
   * - NameServers: Route 53 nameservers (to update at Hostinger)
   */
  private exportOutputs(): void {
    // Export Hosted Zone ID for cross-stack references
    new cdk.CfnOutput(this, 'HostedZoneId', {
      value: this.hostedZone.hostedZoneId,
      exportName: this.exportName('HostedZoneId'),
      description: 'Route 53 Hosted Zone ID - Used by other stacks to create DNS records',
    });

    // Export Hosted Zone Name
    new cdk.CfnOutput(this, 'HostedZoneName', {
      value: this.hostedZone.zoneName,
      exportName: this.exportName('HostedZoneName'),
      description: 'Domain name managed by Route 53',
    });

    // Export Name Servers (to update at Hostinger)
    new cdk.CfnOutput(this, 'NameServers', {
      value: cdk.Fn.join(', ', this.hostedZone.hostedZoneNameServers || []),
      description:
        '⚠️ IMPORTANT: Update these 4 nameservers at Hostinger to delegate DNS to Route 53',
    });
  }
}
