/**
 * The following lines intialize dotenv,
 * so that env vars from the .env file are present in process.env
 */
import * as dotenv from 'dotenv';
dotenv.config();

import {
  EC2Client,
  DescribeVpcsCommand,
  DeleteVpcCommand,
  DescribeInternetGatewaysCommand,
  DeleteInternetGatewayCommand,
  DetachInternetGatewayCommand,
  DescribeSubnetsCommand,
  DeleteSubnetCommand,
  DescribeSecurityGroupsCommand,
  DeleteSecurityGroupCommand,
} from '@aws-sdk/client-ec2';

const client = new EC2Client({ region: process.env.AWS_REGION });

const filter = {
  Filters: [{ Name: 'tag:Project5296 (created by script)', Values: ['*'] }],
};

async function destroySecurityGroup() {
  const describeOutput = await client.send(new DescribeSecurityGroupsCommand(filter));

  describeOutput.SecurityGroups?.forEach(async (sg) => {
    await client.send(new DeleteSecurityGroupCommand({ GroupId: sg.GroupId }));
    console.log(`Deleted Security Group with id: ${sg.GroupId}`);
  });
}

async function destroySubnet() {
  const describeOutput = await client.send(new DescribeSubnetsCommand(filter));

  describeOutput.Subnets?.forEach(async (subnet) => {
    await client.send(new DeleteSubnetCommand({ SubnetId: subnet.SubnetId }));
    console.log(`Deleted Subnet with id: ${subnet.SubnetId}`);
  });
}

async function destroyInternetGateway() {
  const describeOutput = await client.send(new DescribeInternetGatewaysCommand(filter));

  describeOutput.InternetGateways?.forEach(async (igw) => {
    // detach the internet gateway from the VPC
    await client.send(
      new DetachInternetGatewayCommand({ InternetGatewayId: igw.InternetGatewayId, VpcId: igw.Attachments?.[0].VpcId }),
    );
    console.log(
      `Detached Internet Gateway with id: ${igw.InternetGatewayId} from VPC with id: ${igw.Attachments?.[0].VpcId}`,
    );

    await client.send(new DeleteInternetGatewayCommand({ InternetGatewayId: igw.InternetGatewayId }));
    console.log(`Deleted Internet Gateway with id: ${igw.InternetGatewayId}`);
  });
}

async function destroyVpc() {
  const describeOutput = await client.send(new DescribeVpcsCommand(filter));

  describeOutput.Vpcs?.forEach(async (vpc) => {
    await client.send(new DeleteVpcCommand({ VpcId: vpc.VpcId }));
    console.log(`Deleted VPC with id: ${vpc.VpcId}`);
  });
}

async function main() {
  try {
    await destroySecurityGroup();
    await destroySubnet();
    await destroyInternetGateway();
    // route tables are deleted automatically when the VPC is deleted
    await destroyVpc();
  } catch (error) {
    console.error(error);
    console.log('Tips: You can run this script again if it fails.');
  }
}

main();
