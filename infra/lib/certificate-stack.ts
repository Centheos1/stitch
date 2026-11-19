import * as cdk from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import { Construct } from "constructs";

export interface CertificateStackProps extends cdk.StackProps {
  domainName: string;
}

/**
 * TLS certificate for the site. CloudFront only accepts certificates from
 * us-east-1, so this stack must be deployed to that region.
 *
 * DNS validation records are written into the existing Route 53 hosted zone,
 * so the certificate issues without any manual steps.
 */
export class CertificateStack extends cdk.Stack {
  public readonly certificate: acm.ICertificate;

  constructor(scope: Construct, id: string, props: CertificateStackProps) {
    super(scope, id, props);

    const zone = route53.HostedZone.fromLookup(this, "HostedZone", {
      domainName: props.domainName,
    });

    this.certificate = new acm.Certificate(this, "SiteCertificate", {
      domainName: props.domainName,
      subjectAlternativeNames: [`www.${props.domainName}`],
      validation: acm.CertificateValidation.fromDns(zone),
    });

    new cdk.CfnOutput(this, "CertificateArn", {
      value: this.certificate.certificateArn,
    });
  }
}
