import * as path from "path";
import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ses from "aws-cdk-lib/aws-ses";
import * as actions from "aws-cdk-lib/aws-ses-actions";
import * as cr from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";

const DOMAIN = "stitchhandmade.shop";

/**
 * Receives mail for the shop domain and lets the API send replies.
 * The raw message is stored privately. A function files the readable
 * text onto the matching order in DynamoDB.
 */
export function addShopMail(
  scope: Construct,
  table: dynamodb.Table,
  taskRole: iam.IRole,
): string {
  const zone = route53.HostedZone.fromLookup(scope, "MailZone", {
    domainName: DOMAIN,
  });

  const identity = new ses.EmailIdentity(scope, "ShopIdentity", {
    identity: ses.Identity.domain(DOMAIN),
  });
  identity.grantSendEmail(taskRole);
  identity.dkimRecords.forEach((record, index) => {
    new route53.CnameRecord(scope, `Dkim${index}`, {
      zone,
      recordName: cdk.Fn.select(0, cdk.Fn.split(`.${DOMAIN}`, record.name)),
      domainName: record.value,
    });
  });

  new route53.TxtRecord(scope, "Spf", {
    zone,
    values: ["v=spf1 include:amazonses.com -all"],
  });
  new route53.TxtRecord(scope, "Dmarc", {
    zone,
    recordName: "_dmarc",
    values: ["v=DMARC1; p=none; rua=mailto:orders@stitchhandmade.shop"],
  });
  new route53.MxRecord(scope, "InboundMx", {
    zone,
    values: [{
      hostName: `inbound-smtp.${cdk.Stack.of(scope).region}.amazonaws.com`,
      priority: 10,
    }],
  });

  const mailBucket = new s3.Bucket(scope, "InboundMail", {
    blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    encryption: s3.BucketEncryption.S3_MANAGED,
    enforceSSL: true,
    removalPolicy: cdk.RemovalPolicy.RETAIN,
  });

  const filer = new lambdaNode.NodejsFunction(scope, "InboundMailFiler", {
    entry: path.join(__dirname, "../lambda/inbound-mail/index.ts"),
    projectRoot: path.join(__dirname, "../.."),
    depsLockFilePath: path.join(__dirname, "../../package-lock.json"),
    runtime: lambda.Runtime.NODEJS_22_X,
    handler: "handler",
    timeout: cdk.Duration.seconds(60),
    memorySize: 1024,
    environment: {
      TABLE_NAME: table.tableName,
      MAIL_BUCKET: mailBucket.bucketName,
    },
    bundling: {
      externalModules: ["@aws-sdk/*"],
      minify: true,
    },
  });
  table.grantReadWriteData(filer);
  mailBucket.grantReadWrite(filer);
  mailBucket.grantReadWrite(taskRole);

  const ruleSet = new ses.ReceiptRuleSet(scope, "InboundRules", {
    receiptRuleSetName: "stitch-inbound",
  });
  const rule = ruleSet.addRule("FileShopMail", {
    recipients: [DOMAIN],
    scanEnabled: true,
    actions: [
      new actions.S3({
        bucket: mailBucket,
        objectKeyPrefix: "raw/",
      }),
      new actions.Lambda({
        function: filer,
      }),
    ],
  });

  const activate = new cr.AwsCustomResource(scope, "ActivateInboundRules", {
    onCreate: {
      service: "SES",
      action: "setActiveReceiptRuleSet",
      parameters: { RuleSetName: ruleSet.receiptRuleSetName },
      physicalResourceId: cr.PhysicalResourceId.of("stitch-inbound-active"),
    },
    onUpdate: {
      service: "SES",
      action: "setActiveReceiptRuleSet",
      parameters: { RuleSetName: ruleSet.receiptRuleSetName },
      physicalResourceId: cr.PhysicalResourceId.of("stitch-inbound-active"),
    },
    policy: cr.AwsCustomResourcePolicy.fromStatements([
      new iam.PolicyStatement({
        actions: ["ses:SetActiveReceiptRuleSet"],
        resources: ["*"],
      }),
    ]),
  });
  activate.node.addDependency(rule);
  return mailBucket.bucketName;
}
