/**
 * The following lines initialize dotenv,
 * so that env vars from the .env file are present in process.env
 */
import * as dotenv from 'dotenv';
dotenv.config();

import {
  EC2Client,
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
  ModifySubnetAttributeCommand,
  ModifySubnetAttributeCommandInput,
  CreateSecurityGroupCommandInput,
  CreateSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommandInput,
  AuthorizeSecurityGroupIngressCommand,
  RunInstancesCommandInput,
  RunInstancesCommand,
  Instance,
  DescribeSecurityGroupsCommand,
  DescribeInstancesCommand,
} from '@aws-sdk/client-ec2';

import * as fs from 'fs';
import * as net from 'net';

// See: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-eni.html#modify-network-interface-attributes
// Instance type v.s. Maximum network interfaces
const instanceTypeToMaxNetworkInterfaces = {
  't2.nano': 2,
  't2.micro': 2,
  't2.small': 3,
  't2.medium': 3,
  't2.large': 3,
  't3.nano': 2,
  't3.micro': 2,
  't3.small': 3,
  't3.medium': 3,
  't3.large': 3,
};

const PROXY_PORT = 3000;

type SupportedInstanceType = keyof typeof instanceTypeToMaxNetworkInterfaces;

const client = new EC2Client({ region: process.env.AWS_REGION });

function randomId() {
  return Math.random().toString(36).substring(6);
}

function createTagsInfo(operationId: string, resourceShortName: string) {
  return [
    {
      Key: 'Project5296 (created by script)',
      Value: operationId,
    },
    {
      Key: 'Name',
      Value: `Project5296-${resourceShortName}-${operationId}`,
    },
  ];
}

async function createVpc(operationId: string) {
  const input: CreateVpcCommandInput = {
    // DryRun: true,
    CidrBlock: '10.0.0.0/16',
    InstanceTenancy: 'default',
    TagSpecifications: [{ ResourceType: 'vpc', Tags: createTagsInfo(operationId, 'VPC') }],
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

async function createInternetGateway(operationId: string) {
  const input: CreateInternetGatewayCommandInput = {
    TagSpecifications: [{ ResourceType: 'internet-gateway', Tags: createTagsInfo(operationId, 'IGW') }],
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

async function createSubnet(operationId: string, vpcId: string, idx: number) {
  const input: CreateSubnetCommandInput = {
    VpcId: vpcId,
    CidrBlock: `10.0.${idx}.0/28`,
    TagSpecifications: [{ ResourceType: 'subnet', Tags: createTagsInfo(operationId, 'Subnet' + idx) }],
  };
  const output = await client.send(new CreateSubnetCommand(input));
  return output.Subnet;
}

async function ModifySubnetToPublic(subnetId: string) {
  const input: ModifySubnetAttributeCommandInput = { SubnetId: subnetId, MapPublicIpOnLaunch: { Value: true } };
  await client.send(new ModifySubnetAttributeCommand(input));
}

async function createSecurityGroup(operationId: string, vpcId: string): Promise<string | undefined> {
  const input: CreateSecurityGroupCommandInput = {
    Description: 'Project5296 Security Group',
    GroupName: `Project5296-SG-${operationId}`,
    VpcId: vpcId,
    TagSpecifications: [{ ResourceType: 'security-group', Tags: createTagsInfo(operationId, 'SG') }],
  };
  const output = await client.send(new CreateSecurityGroupCommand(input));
  return output.GroupId;
}

async function setupSecurityGroupIngress(groupId: string) {
  const describeOutput = await client.send(new DescribeSecurityGroupsCommand({ GroupIds: [groupId] }));
  const group = describeOutput.SecurityGroups?.[0];
  if (!group) throw new Error('Security Group not found');

  if (group.IpPermissions?.length !== 0) {
    console.log('Security Group already has ingress rules');
    return;
  }

  const input: AuthorizeSecurityGroupIngressCommandInput = {
    GroupId: groupId,
    // all traffic from 0.0.0.0
    IpPermissions: [{ IpProtocol: '-1', IpRanges: [{ CidrIp: '0.0.0.0/0' }] }],
  };
  await client.send(new AuthorizeSecurityGroupIngressCommand(input));
}

async function runInstances(
  operationId: string,
  instanceType: SupportedInstanceType,
  keyName: string,
  networkInterfaceCount: number,
  subnetId: string,
  securityGroupId: string,
  count: number,
) {
  const autorunScript = `#!/bin/bash
apt update
apt install -y tinyproxy
echo -e "Port 3000\\nTimeout 10" > tinyproxy.conf
tinyproxy -c tinyproxy.conf`;

  const userData = Buffer.from(autorunScript).toString('base64');

  const networkInterfaces = [];
  for (let i = 0; i < networkInterfaceCount; i++) {
    networkInterfaces.push({
      DeviceIndex: i,
      SubnetId: subnetId,
      Groups: [securityGroupId],
    });
  }
  const input: RunInstancesCommandInput = {
    MaxCount: count,
    MinCount: count,
    ImageId: 'ami-0d96ec8a788679eb2', // Ubuntu Server 22.04 TLS (HVM), SSD Volume Type
    InstanceType: instanceType,
    KeyName: keyName,
    UserData: userData,
    EbsOptimized: true,
    NetworkInterfaces: networkInterfaces,
    TagSpecifications: [
      {
        ResourceType: 'instance',
        Tags: createTagsInfo(operationId, 'Proxy'),
      },
    ],
    MetadataOptions: {
      HttpTokens: 'required',
      HttpEndpoint: 'enabled',
      HttpPutResponseHopLimit: 2,
    },
    PrivateDnsNameOptions: {
      HostnameType: 'ip-name',
      EnableResourceNameDnsARecord: false,
      EnableResourceNameDnsAAAARecord: false,
    },
    // DryRun: true,
  };
  const output = await client.send(new RunInstancesCommand(input));
  return output.Instances;
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntilAllInstancesReady(instanceIds: string[]): Promise<string[]> {
  while (true) {
    const describeOutput = await client.send(new DescribeInstancesCommand({ InstanceIds: instanceIds }));
    // prettier-ignore
    const allStateNameResults = describeOutput.Reservations
      ?.map((r) => r.Instances
        ?.map((i) => i.State?.Name || '') || [])
          .flat() || [];
    // prettier-ignore
    const allIpResults = describeOutput.Reservations
      ?.map((r) => r.Instances
        ?.map((i) => i.NetworkInterfaces
          ?.map((ni) => ni.Association?.PublicIp) || [])
            .flat())
              .flat() || [];

    const allReadyInstances = allStateNameResults.filter((s) => s === 'running');
    const allReadyIps = allIpResults.filter((ip) => ip !== undefined) as string[];

    const isAllInstanceRunning = allReadyInstances.length === allStateNameResults.length;
    const isAllNetworkInterfaceReady = allReadyIps.length === allIpResults.length;

    if (isAllNetworkInterfaceReady && isAllInstanceRunning) {
      console.log('All instances are ready');
      return allReadyIps;
    } else {
      // print numbers
      const a = allReadyInstances.length;
      const b = allStateNameResults.length;
      const c = allReadyIps.length;
      const d = allIpResults.length;
      console.log(`Waiting for ${a}/${b} instances to be ready, ${c}/${d} IPs to be ready`);
    }

    await delay(1000);
  }
}

async function tryConnectingToProxy(ip: string): Promise<boolean> {
  return new Promise((resolve) => {
    const client = new net.Socket();
    client.setTimeout(2000);
    client.on('connect', () => {
      client.end();
      resolve(true);
    });
    client.on('timeout', () => {
      client.destroy();
      resolve(false);
    });
    client.on('error', () => {
      client.destroy();
      resolve(false);
    });
    client.connect(PROXY_PORT, ip);
  });
}

async function waitUntilAllProxyReady(ips: string[]) {
  let notReadyList = [...ips];
  while (true) {
    const newNotReadyList = [];
    for (const ip of notReadyList) {
      const isReady = await tryConnectingToProxy(ip);
      if (isReady) {
        console.log(`Proxy at ${ip} is ready`);
      } else {
        console.log(`Proxy at ${ip} is not ready`);
        newNotReadyList.push(ip);
      }
    }
    notReadyList = newNotReadyList;

    if (notReadyList.length === 0) {
      console.log('All proxies are ready');
      return;
    } else {
      console.log(`Waiting for ${notReadyList.length} proxies to be ready...`);
    }

    await delay(1000);
  }
}

async function main() {
  const argv = require('minimist')(process.argv.slice(2));
  const instanceTypeRaw = argv['instance-type'];
  const ipCountRaw = argv['ip-count'];
  const instanceKeyName = process.env.INSTANCE_KEY_NAME;

  if (!instanceKeyName) {
    console.error('Please provide the key pair id in the .env file');
    process.exit(1);
  }

  if (!instanceTypeRaw || !ipCountRaw) {
    console.error('Please provide instance type and ip count');
    console.error('Example: npm run create -- --instance-type t3.micro --ip-count 1');
    process.exit(1);
  }

  const knownInstanceTypes = Object.keys(instanceTypeToMaxNetworkInterfaces);
  if (!knownInstanceTypes.includes(instanceTypeRaw)) {
    console.error('Unknown instance type');
    process.exit(1);
  }
  const instanceType = instanceTypeRaw as keyof typeof instanceTypeToMaxNetworkInterfaces;

  const ipCount = parseInt(ipCountRaw);
  if (isNaN(ipCount) || ipCount < 1) {
    console.error('Invalid ip count');
    process.exit(1);
  }

  const operationId = randomId();
  console.log(`Operation ID: ${operationId}`);

  // Create VPC
  const vpc = await createVpc(operationId);
  if (!vpc || vpc.VpcId === undefined) throw new Error('VPC not created');
  console.log(`VPC created with id: ${vpc.VpcId}`);

  // Create Route Table
  const rtb = (await getRouteTable(vpc.VpcId))[0];
  if (!rtb || rtb.RouteTableId === undefined) throw new Error('Route table not found');
  console.log(`Route Table found with id: ${rtb.RouteTableId}`);

  // Tag the Route Table
  await putTags([rtb.RouteTableId], createTagsInfo(operationId, 'RTB'));
  console.log(`Route Table tagged with id: ${rtb.RouteTableId}`);

  // Create Internet Gateway
  const igw = await createInternetGateway(operationId);
  if (!igw || igw.InternetGatewayId === undefined) throw new Error('Internet Gateway not created');
  console.log(`Internet Gateway created with id: ${igw.InternetGatewayId}`);

  // Associate Internet Gateway
  await attachInternetGateway(igw.InternetGatewayId, vpc.VpcId);
  console.log('Internet Gateway associated with VPC');

  // Create Route to Internet Gateway
  await createRouteToInternetGateway(rtb.RouteTableId, igw.InternetGatewayId);
  console.log('Route from Route Table to Internet Gateway created');

  // Create Security Group
  const securityGroupId = await createSecurityGroup(operationId, vpc.VpcId);
  if (!securityGroupId) throw new Error('Security Group not created');
  console.log(`Security Group created with id: ${securityGroupId}`);

  // No need to setup security group ingress as the default security group allows all traffic
  await setupSecurityGroupIngress(securityGroupId);
  console.log('Security Group ingress rules setup');

  // Create Subnet
  const subnet = await createSubnet(operationId, vpc.VpcId, 0);
  if (!subnet || subnet.SubnetId === undefined) throw new Error('Subnet not created');
  console.log(`Subnet created with id: ${subnet.SubnetId}`);

  // Modify Subnet to Public
  await ModifySubnetToPublic(subnet.SubnetId);
  console.log(`Subnet modified to public with id: ${subnet.SubnetId}`);

  // const networkInterfaceCount = instanceTypeToMaxNetworkInterfaces[instanceType];
  const networkInterfaceCount = 1;
  const instanceCount = Math.ceil(ipCount / networkInterfaceCount);
  console.log(`Creating ${instanceCount} instances`);

  const instances = await runInstances(
    operationId,
    instanceType,
    instanceKeyName,
    networkInterfaceCount,
    subnet.SubnetId,
    securityGroupId,
    instanceCount,
  );
  if (!instances) throw new Error('Instances not created');

  const allIps = await waitUntilAllInstancesReady(instances.map((i) => i.InstanceId || ''));

  fs.writeFileSync('instances.txt', allIps.join('\n'));
  console.log('Public IPs written to instances.txt');

  await waitUntilAllProxyReady(allIps);

  console.log('Done');
}

main();
