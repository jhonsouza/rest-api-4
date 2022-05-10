import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import PdDeployTask from "@passeidireto/pd-deploy-task";
// const policy = new aws.iam.Policy(`test-execution-policy`, {
//     name: "test-execution-policy",
//     path: '/',
//     description: 'My test policy',
//     policy: JSON.stringify({
//         Version: '2012-10-17',
//         Statement: [
//             {
//                 Action: [
//                     'ecr:GetAuthorizationToken',
//                     'ecr:BatchCheckLayerAvailability',
//                     'ecr:GetDownloadUrlForLayer',
//                     'ecr:BatchGetImage',
//                     'logs:CreateLogStream',
//                     'logs:PutLogEvents',
//                 ],
//                 Effect: 'Allow',
//                 Resource: '*',
//             },
//         ],
//     }),
// });
// const taskRoleArn = new aws.iam.Role("test-execution-role", {
//     name: "test-execution-policy",
//     assumeRolePolicy: JSON.stringify({
//         Version: "2012-10-17",
//         Statement: [{
//             Action: "sts:AssumeRole",
//             Effect: "Allow",
//             Principal: {
//                 Service: "ecs-tasks.amazonaws.com",
//             },
//         }],
//     }),
// });
//     new aws.iam.PolicyAttachment(`test/pa`, {
//         policyArn: policy.arn,
//         roles: [taskRoleArn.name],
//     });
const hostedZone = pulumi.output(aws.route53.getZone({
    name: "pd-sandbox.com.",
    privateZone: true
}));
const dnsRecord = new aws.route53.Record("test.pd-sandbox.com",{
    name: "test.pd-sandbox.com",
    type: "CNAME",
    zoneId: hostedZone.id,
    records: ["lb-web-cadastro-42593753.us-east-2.elb.amazonaws.com"],
    ttl: 300
})
const loadBalancer = aws.alb.getLoadBalancer({
    name: "lb-web-cadastro"
});

const listenerArn = loadBalancer.then(loadBalancer => aws.alb.getListener({
    loadBalancerArn: loadBalancer.arn,
    port: 8089
}))
const pdTaskDeploy = new PdDeployTask(`${pulumi.getStack()}`,{
    clusterName: "default",
    cname: "test.pd-sandbox.com",
    datapointsToAlarm: 2,
    datapointsToAlarmDown: 2,
    ecrImage: "jhonatans/test:latest",
    evaluationPeriods: 60,
    evaluationPeriodsDown: 180,
    healthCheckPath: "/posts",
    listenerArn: listenerArn.then(listenerArn => listenerArn.arn),
    maxCapacity: 6,
    minCapacity: 1,
    metricAggregationType: "Average",
    metricName:"CPUUtilization",
    pathPattern: ["/posts"],
    period: 60,
    port: 3000,
    scalingAdjustment: 1,
    scalingAdjustmentDown: -1,
    statistic: "Average",
    taskRoleArn: "",
    threshold: 30,
    unit: "Percent",
    vpcId: "vpc-de9a33b5",
    region: aws.config.region,
    cpu: 128,
    memory: 128,
    memoryReservation: 128,
    retentionInDays: 30,
});
