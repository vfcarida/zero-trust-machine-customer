# Infrastructure as Code (IaC): Machine Customer Environment on AWS
# NOTE: This Terraform configuration serves as a demonstration and reference
# architecture for NIST SP 800-207 Workload Identity and Network Isolation.
# Per ZTMC framing (T03/T07), this is non-deployed reference infrastructure
# marked explicitly as demonstration-only.

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  description = "AWS region for the demonstration infrastructure"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment tier label (marked demonstration-only)"
  type        = string
  default     = "demonstration-only"
}

variable "spiffe_oidc_issuer_url" {
  description = "SPIFFE OIDC federation issuer endpoint"
  type        = string
  default     = "https://auth.zero-trust.machine.customer"
}

variable "spiffe_workload_client_id" {
  description = "Audience / Client ID for the machine customer workload"
  type        = string
  default     = "machine-customer-agent-001"
}

variable "spiffe_oidc_thumbprint" {
  description = "Root CA SHA-1 thumbprint for the OIDC IdP"
  type        = string
  default     = "9e99a48a9960b14926cc7f3b02e22da2b0ab7280"
}

# 1. Isolated Virtual Private Cloud (VPC) with Private Subnets
resource "aws_vpc" "machine_customer_vpc" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name        = "zero-trust-machine-customer-vpc"
    Environment = var.environment
  }
}

resource "aws_subnet" "private_subnet_a" {
  vpc_id            = aws_vpc.machine_customer_vpc.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "${var.aws_region}a"

  tags = {
    Name        = "machine-customer-private-a"
    Environment = var.environment
  }
}

# 2. Non-Human Identity (NHI) IAM Role & OIDC Trust Policy
resource "aws_iam_role" "machine_customer_nhi_role" {
  name = "ZeroTrustMachineCustomerNHIRole"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.spiffe_oidc.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "${aws_iam_openid_connect_provider.spiffe_oidc.url}:sub" = "spiffe://zero-trust.machine.customer/workload/machine-customer-agent"
          }
        }
      }
    ]
  })

  tags = {
    Name        = "zero-trust-machine-customer-nhi-role"
    Environment = var.environment
  }
}

resource "aws_iam_openid_connect_provider" "spiffe_oidc" {
  url             = var.spiffe_oidc_issuer_url
  client_id_list  = [var.spiffe_workload_client_id]
  thumbprint_list = [var.spiffe_oidc_thumbprint]

  tags = {
    Name        = "zero-trust-spiffe-oidc-provider"
    Environment = var.environment
  }
}
