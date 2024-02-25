# Introduction

This project is a script to create and destroy a network setup used for project Project5296. The script creates a VPC with a public subnet, an internet gateway, and EC2 instances. For each EC2 instance, a public IP address is allocated and a security group is created to allow HTTP traffic from the public IP address. The script also installs and starts an HTTP proxy on each EC2 instance.

# Pre-requisites

- Node.js 18.16.0 or later
- An AWS account (Using AWS Academic Learner Lab is not recommended as it has limitation on AWS IAM)

# Setup AWS IAM

1. Create a new user in the AWS IAM console.
2. Attach the `AmazonEC2FullAccess` and `AmazonVPCFullAccess` policies to the user.
3. Create a new access key for the user and save the `Access key ID` and `Secret access key`.

# Setup .env File

Create a `.env` file in the root of the project with the following content:

```env
AWS_REGION=ap-east-1
AWS_ACCESS_KEY_ID=????
AWS_SECRET_ACCESS_KEY=????
INSTANCE_KEY_NAME=????
```

The `AWS_REGION` is the region where all the resources will be created.

The `AWS_ACCESS_KEY_ID` and `AWS_SECRET` are the credentials of the user created in the first step.

The `INSTANCE_KEY_NAME` is the name of the key pair that will be used to connect to the EC2 instances. Create a new key pair in the EC2 console and enter the name of the key pair here.

# Create the Network Setup

Run the following command to create the network setup:

```bash
npm run create -- --instance-type t3.micro --ip-count 1
```

Where `--instance-type` is the type of the EC2 instance and `--ip-count` is the number of instances to create. All created resources will be tagged with the `Project5296 (created by script)` tag.

You should check if all HTTP proxy are running on the EC2 instances. If not, you can run the following command to start the HTTP proxy manually by SSH into the EC2 instances or connect to the EC2 instances using the AWS Console:
```bash
sudo killall tinyproxy; sleep 1; tinyproxy -c /tinyproxy.conf
```

# Destroy the Network Setup

Run the following command to tear down the network setup:

```bash
npm run destroy
```

This will destroy all the EC2 instances, internet gateways, and VPCs that are tagged with the `Project5296 (created by script)` tag. Not only the resources created by the last `create` command will be destroyed.

# Developing

## Visual Studio Code

-   Installing the Eslint (`dbaeumer.vscode-eslint`) and Prettier - Code formatter (`esbenp.prettier-vscode`) extensions is recommended.

# Linting & Formatting

-   Run `yarn lint` or `npm lint` to lint the code.
-   Run `yarn format` or `npm format` to format the code.
