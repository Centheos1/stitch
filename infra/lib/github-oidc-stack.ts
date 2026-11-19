import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface GithubOidcStackProps extends cdk.StackProps {
  /** GitHub repository in owner/name form. */
  repository: string;
  /** The only branch allowed to assume the deploy role. */
  branch: string;
}

/**
 * Lets GitHub Actions deploy to this account without stored access keys.
 *
 * GitHub gets a short-lived OIDC token for each run. The deploy role trusts
 * only the named repository and branch, and its only permission is to assume
 * the CDK bootstrap roles. Those roles do the actual CloudFormation work, so
 * this role never needs broad service permissions.
 *
 * The GitHub OIDC provider already exists in this account, so it is imported
 * rather than created.
 */
export class GithubOidcStack extends cdk.Stack {
  public readonly deployRoleArn: string;

  constructor(scope: Construct, id: string, props: GithubOidcStackProps) {
    super(scope, id, props);

    const provider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      "GithubOidcProvider",
      `arn:${this.partition}:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`,
    );

    const deployRole = new iam.Role(this, "GithubDeployRole", {
      roleName: "stitch-github-deploy",
      description: `Assumed by GitHub Actions from ${props.repository} on ${props.branch}`,
      maxSessionDuration: cdk.Duration.hours(1),
      assumedBy: new iam.FederatedPrincipal(
        provider.openIdConnectProviderArn,
        {
          StringEquals: {
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          },
          StringLike: {
            "token.actions.githubusercontent.com:sub": `repo:${props.repository}:ref:refs/heads/${props.branch}`,
          },
        },
        "sts:AssumeRoleWithWebIdentity",
      ),
    });

    // CDK bootstrap roles: deploy, file publishing, image publishing, lookup.
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sts:AssumeRole"],
        resources: [
          `arn:${this.partition}:iam::${this.account}:role/cdk-hnb659fds-*`,
        ],
      }),
    );

    this.deployRoleArn = deployRole.roleArn;

    new cdk.CfnOutput(this, "DeployRoleArn", { value: this.deployRoleArn });
  }
}
