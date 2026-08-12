# Infrastructure as Code (IaC): Machine Customer Environment on AWS
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
  type    = string
  default = "us-east-1"
}

# 1. Isolated Virtual Private Cloud (VPC) with Private Subnets
resource "aws_vpc" "machine_customer_vpc" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name        = "zero-trust-machine-customer-vpc"
    Environment = "production"
  }
}

resource "aws_subnet" "private_subnet_a" {
  vpc_id            = aws_vpc.machine_customer_vpc.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "${var.aws_region}a"

  tags = {
    Name = "machine-customer-private-a"
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
}

resource "aws_iam_openid_connect_provider" "spiffe_oidc" {
  url             = "https://auth.zero-trust.machine.customer"
  client_id_list  = ["machine-customer-agent-001"]
  thumbprint_list = ["9e99a48a9960b14926cc7f3b02e22da2b0ab7280"]
}
