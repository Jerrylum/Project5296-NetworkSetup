/**
 * The following lines intialize dotenv,
 * so that env vars from the .env file are present in process.env
 */
import * as dotenv from 'dotenv';
dotenv.config();

import {
  EC2Client,
  RunInstancesCommand,
  CreateVpcCommand,
  CreateVpcCommandInput,
  RouteTable,
  DescribeRouteTablesCommand,
  CreateTagsCommand,
  DescribeRouteTablesCommandInput,
  CreateInternetGatewayCommand,
  CreateInternetGatewayCommandInput,
  AttachInternetGatewayCommandInput,
  AttachInternetGatewayCommand,
  CreateRouteCommandInput,
  CreateRouteCommand,
  CreateSubnetCommandInput,
  CreateSubnetCommand,
} from '@aws-sdk/client-ec2';

const client = new EC2Client({ region: process.env.AWS_REGION });

function randomId() {
  return Math.random().toString(36).substring(6);
}

function createTagsInfo(nameId: string, resourceShortName: string) {
  return [
    {
      Key: 'Project5296 (created by script)',
      Value: nameId,
    },
    {
      Key: 'Name',
      Value: `Project5296-${resourceShortName}-${nameId}`,
    },
  ];
}

async function createVpc(nameId: string) {
  const input: CreateVpcCommandInput = {
    // DryRun: true,
    CidrBlock: '10.0.0.0/16',
    InstanceTenancy: 'default',
    TagSpecifications: [{ ResourceType: 'vpc', Tags: createTagsInfo(nameId, 'VPC') }],
  };
  const output = await client.send(new CreateVpcCommand(input));
  return output.Vpc;
}

async function getRouteTable(vpcId: string): Promise<RouteTable[]> {
  const input: DescribeRouteTablesCommandInput = { Filters: [{ Name: 'vpc-id', Values: [vpcId] }] };
  const output = await client.send(new DescribeRouteTablesCommand(input));
  return output.RouteTables || [];
}

async function putTags(resources: string[], tags: { Key: string; Value: string }[]) {
  await client.send(new CreateTagsCommand({ Resources: resources, Tags: tags }));
}

async function createInternetGateway(nameId: string) {
  const input: CreateInternetGatewayCommandInput = {
    TagSpecifications: [{ ResourceType: 'internet-gateway', Tags: createTagsInfo(nameId, 'IGW') }],
  };
  const output = await client.send(new CreateInternetGatewayCommand(input));
  return output.InternetGateway;
}

async function attachInternetGateway(igwId: string, vpcId: string) {
  const input: AttachInternetGatewayCommandInput = { InternetGatewayId: igwId, VpcId: vpcId };
  await client.send(new AttachInternetGatewayCommand(input));
}

async function createRouteToInternetGateway(rtbId: string, igwId: string) {
  const input: CreateRouteCommandInput = {
    RouteTableId: rtbId,
    DestinationCidrBlock: '0.0.0.0/0',
    GatewayId: igwId,
  };
  await client.send(new CreateRouteCommand(input));
}

async function createPublicSubnet(vpcId: string) {
  const input: CreateSubnetCommandInput = { VpcId: vpcId, CidrBlock: '10.0.0.0/28' };
  const output = await client.send(new CreateSubnetCommand(input));
  return output.Subnet;
}

async function main() {
  const nameId = randomId();

  // Create VPC
  const vpc = await createVpc(nameId);
  if (!vpc || vpc.VpcId === undefined) throw new Error('VPC not created');
  console.log(`VPC created with id: ${vpc.VpcId}`);

  // Create Route Table
  const rtb = (await getRouteTable(vpc.VpcId))[0];
  if (!rtb || rtb.RouteTableId === undefined) throw new Error('Route table not found');
  console.log(`Route Table found with id: ${rtb.RouteTableId}`);

  // Tag the Route Table
  await putTags([rtb.RouteTableId], createTagsInfo(nameId, 'RTB'));
  console.log(`Route Table tagged with id: ${rtb.RouteTableId}`);

  // Create Internet Gateway
  const igw = await createInternetGateway(nameId);
  if (!igw || igw.InternetGatewayId === undefined) throw new Error('Internet Gateway not created');
  console.log(`Internet Gateway created with id: ${igw.InternetGatewayId}`);

  // Associate Internet Gateway
  await attachInternetGateway(igw.InternetGatewayId, vpc.VpcId);
  console.log('Internet Gateway associated with VPC');

  // Create Route to Internet Gateway
  await createRouteToInternetGateway(rtb.RouteTableId, igw.InternetGatewayId);
  console.log('Route from Route Table to Internet Gateway created');

  console.log(rtb);
}

main();
