/**
 * The following lines initialize dotenv,
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
  DescribeInstancesCommand,
  TerminateInstancesCommand,
} from '@aws-sdk/client-ec2';

const client = new EC2Client({ region: process.env.AWS_REGION });

const filter = {
  Filters: [{ Name: 'tag:Project5296 (created by script)', Values: ['*'] }],
};

async function destroyInstances() {
  const describeOutput = await client.send(new DescribeInstancesCommand(filter));

  const instances =
    describeOutput.Reservations?.map((r) => r.Instances?.map((i) => i.InstanceId || '') || []).flat() || [];
  if (instances.length !== 0) {
    await client.send(new TerminateInstancesCommand({ InstanceIds: instances }));
    console.log(`Send termination request for instances: ${instances.join(', ')}`);
  }
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntilAllInstancesTerminated() {
  while (true) {
    const describeOutput = await client.send(new DescribeInstancesCommand(filter));
    // prettier-ignore
    const instanceStateNames = describeOutput.Reservations
      ?.map((r) => r.Instances
        ?.map((i) => i.State?.Name || '') || [])
          .flat();

    if (instanceStateNames?.length === 0) {
      console.log('No instances found.');
      break;
    }

    const isRunningCount = instanceStateNames?.filter((s) => s !== 'terminated');

    if (isRunningCount?.length === 0) {
      console.log('All instances are terminated.');
      break;
    } else {
      console.log(`Waiting for ${isRunningCount?.length} instances to terminate...`);
    }

    await delay(1000);
  }
}

async function destroySecurityGroups() {
  const describeOutput = await client.send(new DescribeSecurityGroupsCommand(filter));

  describeOutput.SecurityGroups?.forEach(async (sg) => {
    await client.send(new DeleteSecurityGroupCommand({ GroupId: sg.GroupId }));
    console.log(`Deleted Security Group with id: ${sg.GroupId}`);
  });
}

async function destroySubnets() {
  const describeOutput = await client.send(new DescribeSubnetsCommand(filter));

  describeOutput.Subnets?.forEach(async (subnet) => {
    await client.send(new DeleteSubnetCommand({ SubnetId: subnet.SubnetId }));
    console.log(`Deleted Subnet with id: ${subnet.SubnetId}`);
  });
}

async function destroyInternetGateways() {
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

async function destroyVpcs() {
  const describeOutput = await client.send(new DescribeVpcsCommand(filter));

  describeOutput.Vpcs?.forEach(async (vpc) => {
    await client.send(new DeleteVpcCommand({ VpcId: vpc.VpcId }));
    console.log(`Deleted VPC with id: ${vpc.VpcId}`);
  });
}

async function main() {
  try {
    await destroyInstances();
    await waitUntilAllInstancesTerminated();
    await destroySecurityGroups();
    await destroySubnets();
    await destroyInternetGateways();
    // route tables are deleted automatically when the VPC is deleted
    await destroyVpcs();
  } catch (error) {
    console.error(error);
    console.log('Tips: You can run this script again if it fails.');
  }
}

main();
