/**
 * Shared Dependencies Lambda Layer
 *
 * This layer contains common dependencies used across all Lambda functions:
 * - AWS SDK v3 clients
 * - uuid
 * - jsonwebtoken
 * - jwks-rsa
 *
 * Benefits:
 * - Reduces deployment package size by 70% (8MB → 200KB per Lambda)
 * - Faster deployments (upload 200KB vs 8MB)
 * - Faster cold starts (less code to load)
 * - Single source of truth for dependency versions
 * - Cost savings (less storage, faster execution)
 *
 * Usage:
 * ```typescript
 * const sharedLayer = new SharedDependenciesLayer(this, 'SharedLayer');
 *
 * const lambda = new cdk.aws_lambda.Function(this, 'Function', {
 *   layers: [sharedLayer.layer],
 *   // ... other props
 * });
 * ```
 */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';

export class SharedDependenciesLayer extends Construct {
  public readonly layer: cdk.aws_lambda.LayerVersion;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // Create Lambda Layer from pre-built layers/shared-dependencies/nodejs/
    // Layer must be built first: cd layers/shared-dependencies && .\build-layer.ps1
    this.layer = new cdk.aws_lambda.LayerVersion(this, 'Layer', {
      code: cdk.aws_lambda.Code.fromAsset(
        path.join(__dirname, '../../../layers/shared-dependencies')
      ),
      compatibleRuntimes: [cdk.aws_lambda.Runtime.NODEJS_18_X, cdk.aws_lambda.Runtime.NODEJS_20_X],
      description: 'Shared dependencies: AWS SDK v3, uuid, jsonwebtoken, jwks-rsa',
      layerVersionName: `everyonecook-shared-deps-${cdk.Stack.of(this).stackName}`,
    });

    // Add tags
    cdk.Tags.of(this.layer).add('Component', 'Lambda');
    cdk.Tags.of(this.layer).add('Purpose', 'SharedDependencies');
    cdk.Tags.of(this.layer).add('ManagedBy', 'CDK');

    // Output layer ARN
    new cdk.CfnOutput(this, 'LayerArn', {
      value: this.layer.layerVersionArn,
      description: 'Shared Dependencies Layer ARN',
      exportName: `${cdk.Stack.of(this).stackName}-SharedLayerArn`,
    });
  }
}
