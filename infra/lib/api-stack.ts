import * as path from "path";
import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ecrAssets from "aws-cdk-lib/aws-ecr-assets";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import { IMAGES_BUCKET_NAME, IMAGES_BUCKET_REGION } from "./images";
import { addShopMail } from "./mail";

/**
 * Port the container listens on. Must match ENV PORT in the Dockerfile.
 * The app reads process.env.PORT and falls back to this same number.
 */
const CONTAINER_PORT = 3000;

/**
 * Express API on ECS Express Mode (Fargate behind a managed load balancer).
 *
 * `cdk deploy` builds the Dockerfile at the repo root and rolls that image
 * out. The service keeps at least one task running, so there is no cold start.
 */
export class ApiStack extends cdk.Stack {
  /** Endpoint hostname for the service. Used as the CloudFront origin. */
  public readonly serviceEndpoint: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Lets ECS pull the image and write logs for the task.
    const executionRole = new iam.Role(this, "TaskExecutionRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonECSTaskExecutionRolePolicy",
        ),
      ],
    });

    // Lets ECS create and manage the load balancer, security groups, and scaling.
    const infrastructureRole = new iam.Role(this, "InfrastructureRole", {
      assumedBy: new iam.ServicePrincipal("ecs.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonECSInfrastructureRoleforExpressGatewayServices",
        ),
      ],
    });

    // Single table for products, category indexes, and orders.
    const table = new dynamodb.Table(this, "ShopTable", {
      tableName: "stitch",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
    });
    table.addGlobalSecondaryIndex({
      indexName: "gsi1",
      partitionKey: { name: "gsi1pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "gsi1sk", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const taskRole = new iam.Role(this, "TaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });
    table.grantReadWriteData(taskRole);

    // The secret value is the password itself. CloudFormation generates it
    // once and does not overwrite later edits, so a console edit is the reset.
    const adminPassword = new secretsmanager.Secret(this, "AdminPassword", {
      secretName: "stitch/admin-password",
      description:
        "STITCH admin password. The secret value is the password itself. Change it from the admin page, or edit it here.",
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      generateSecretString: {
        excludePunctuation: true,
        includeSpace: false,
        passwordLength: 32,
      },
    });
    // Separate from the password so a reset does not rotate cookie signing.
    const sessionSecret = new secretsmanager.Secret(this, "SessionSecret", {
      secretName: "stitch/session-secret",
      description: "Signs the STITCH admin session cookie. Leave this value as generated.",
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      generateSecretString: {
        excludePunctuation: true,
        includeSpace: false,
        passwordLength: 64,
      },
    });
    adminPassword.grantRead(taskRole);
    adminPassword.grantWrite(taskRole);
    sessionSecret.grantRead(taskRole);
    const mailBucketName = addShopMail(this, table, taskRole);

    taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObject"],
        resources: [`arn:aws:s3:::${IMAGES_BUCKET_NAME}/images/*`],
      }),
    );

    const cluster = new ecs.CfnCluster(this, "Cluster", {
      clusterName: "stitch",
    });

    // Fargate runs x86_64. Building for that platform matters on Apple Silicon.
    const image = new ecrAssets.DockerImageAsset(this, "ApiImage", {
      directory: path.resolve(__dirname, "../.."),
      platform: ecrAssets.Platform.LINUX_AMD64,
    });
    image.repository.grantPull(executionRole);

    const service = new ecs.CfnExpressGatewayService(this, "ApiService", {
      serviceName: "stitch-api",
      cluster: cluster.ref,
      infrastructureRoleArn: infrastructureRole.roleArn,
      executionRoleArn: executionRole.roleArn,
      taskRoleArn: taskRole.roleArn,
      cpu: "0.25 vCPU",
      memory: "0.5 GB",
      healthCheckPath: "/api/health",
      primaryContainer: {
        image: image.imageUri,
        containerPort: CONTAINER_PORT,
        environment: [
          { name: "PORT", value: String(CONTAINER_PORT) },
          { name: "NODE_ENV", value: "production" },
          { name: "TABLE_NAME", value: table.tableName },
          { name: "AWS_REGION", value: this.region },
          { name: "IMAGES_BUCKET", value: IMAGES_BUCKET_NAME },
          { name: "IMAGES_BUCKET_REGION", value: IMAGES_BUCKET_REGION },
          { name: "ADMIN_PASSWORD_SECRET_ID", value: adminPassword.secretName },
          { name: "SESSION_SECRET_ID", value: sessionSecret.secretName },
          { name: "MAIL_FROM", value: "orders@stitchhandmade.shop" },
          { name: "ORDER_DOMAIN", value: "stitchhandmade.shop" },
          { name: "MAIL_BUCKET", value: mailBucketName },
        ],
      },
      scalingTarget: {
        minTaskCount: 1,
        maxTaskCount: 2,
      },
    });

    // The endpoint comes back as "https://host". CloudFront origins need the
    // bare hostname, so take everything after the scheme.
    this.serviceEndpoint = cdk.Fn.select(
      1,
      cdk.Fn.split("https://", service.getAtt("Endpoint").toString()),
    );

    new cdk.CfnOutput(this, "ApiEndpoint", { value: this.serviceEndpoint });
    new cdk.CfnOutput(this, "TableName", { value: table.tableName });
    new cdk.CfnOutput(this, "AdminPasswordSecretName", { value: adminPassword.secretName });
  }
}
