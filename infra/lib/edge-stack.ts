import * as cdk from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import { Construct } from "constructs";
import { IMAGES_BUCKET_NAME } from "./images";

export interface EdgeStackProps extends cdk.StackProps {
  domainName: string;
  certificate: acm.ICertificate;
  /** Hostname of the ECS Express API service, without scheme. */
  apiOrigin: string;
  /** Directory holding the built React app (output of `npm run build`). */
  siteBuildPath: string;
}

/**
 * Public entry point for the site: CloudFront in front of
 *   - a private S3 bucket holding the built React app (default behaviour)
 *   - a private S3 bucket of product images (/images/*)
 *   - the ECS Express API (/api/*)
 *
 * Must be deployed to us-east-1 because CloudFront certificates live there.
 */
export class EdgeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EdgeStackProps) {
    super(scope, id, props);

    const { domainName, certificate, apiOrigin } = props;
    const wwwName = `www.${domainName}`;

    // Private bucket. CloudFront reads it via Origin Access Control.
    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Single-page app routing: any path without a file extension serves
    // index.html so /shop or /product/3 work when loaded directly.
    // Also redirects www to the apex domain.
    const spaFunction = new cloudfront.Function(this, "SpaRouting", {
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var host = request.headers.host ? request.headers.host.value : "";

  if (host === "${wwwName}") {
    return {
      statusCode: 301,
      statusDescription: "Moved Permanently",
      headers: { location: { value: "https://${domainName}" + request.uri } },
    };
  }

  if (request.uri.indexOf(".") === -1) {
    request.uri = "/index.html";
  }
  return request;
}
`),
    });

    // Product photos. The browser stores paths like /images/<id>.jpg, and this
    // behavior serves them. Keys are unique, so the cached copy never goes stale.
    const imagesBucket = new s3.Bucket(this, "ImagesBucket", {
      bucketName: IMAGES_BUCKET_NAME,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT],
          allowedOrigins: [
            `https://${domainName}`,
            `https://${wwwName}`,
            "http://localhost:3000",
          ],
          allowedHeaders: ["content-type"],
          maxAge: 3000,
        },
      ],
    });

    const apiOriginConfig = new origins.HttpOrigin(apiOrigin, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
    });

    const distribution = new cloudfront.Distribution(this, "SiteDistribution", {
      comment: `STITCH site (${domainName})`,
      domainNames: [domainName, wwwName],
      certificate,
      defaultRootObject: "index.html",
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
        functionAssociations: [
          {
            function: spaFunction,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      additionalBehaviors: {
        "/images/*": {
          origin: origins.S3BucketOrigin.withOriginAccessControl(imagesBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          compress: true,
        },
        "/api/*": {
          origin: apiOriginConfig,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          // API responses must not be cached: orders and admin writes change state.
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          // The API's load balancer must receive its own host name, not the
          // custom domain. Everything else from the viewer is forwarded.
          originRequestPolicy:
            cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
    });

    // Uploads the built site on every deploy and invalidates the CloudFront
    // cache, so the CI role needs no direct S3 or CloudFront permissions.
    new s3deploy.BucketDeployment(this, "DeploySite", {
      sources: [s3deploy.Source.asset(props.siteBuildPath)],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ["/*"],
      prune: true,
    });

    const zone = route53.HostedZone.fromLookup(this, "HostedZone", {
      domainName,
    });

    for (const [id, name] of [
      ["Apex", domainName],
      ["Www", wwwName],
    ] as const) {
      new route53.ARecord(this, `${id}A`, {
        zone,
        recordName: name,
        target: route53.RecordTarget.fromAlias(
          new targets.CloudFrontTarget(distribution),
        ),
      });
      new route53.AaaaRecord(this, `${id}Aaaa`, {
        zone,
        recordName: name,
        target: route53.RecordTarget.fromAlias(
          new targets.CloudFrontTarget(distribution),
        ),
      });
    }

    new cdk.CfnOutput(this, "SiteBucketName", { value: siteBucket.bucketName });
    new cdk.CfnOutput(this, "DistributionId", {
      value: distribution.distributionId,
    });
    new cdk.CfnOutput(this, "SiteUrl", { value: `https://${domainName}` });
  }
}
