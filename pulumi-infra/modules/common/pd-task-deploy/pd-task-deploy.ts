import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';

import n from '../naming/pulumi-naming';

export interface PdDeployTaskArgs {
    clusterName: string;
    port: number;
    listenerArn: string;
    cname: string;
    pathPattern: string[];
    healthCheckPath: string;
    ecrImage: string;
    minCapacity: number;
    maxCapacity: number;
    scalingAdjustment: number;
    scalingAdjustmentDown: number;
    metricAggregationType: string;
    period: number;
    metricName: string;
    statistic: string;
    unit: string;
    threshold: number;
    evaluationPeriods: number;
    datapointsToAlarm: number;
    evaluationPeriodsDown: number;
    datapointsToAlarmDown: number;
    taskRoleArn: pulumi.Input<string>;
    vpcId: string;
    tags?: Record<string, string>;
    region?: string;
    retentionInDays?: number;
    cpu?: number;
    memory?: number;
    memoryReservation?: number;
}

export default class PdDeployTask extends pulumi.ComponentResource {
    readonly taskDefinition: aws.ecs.TaskDefinition;

    readonly service: aws.ecs.Service;

    readonly logGroup: aws.cloudwatch.LogGroup;

    readonly targetGroup: aws.alb.TargetGroup;

    readonly listenerRule: aws.alb.ListenerRule;

    readonly ecsTarget: aws.appautoscaling.Target;

    readonly ecsUpPolicy: aws.appautoscaling.Policy;

    readonly ecsDownPolicy: aws.appautoscaling.Policy;

    readonly cwUpAlarm: aws.cloudwatch.MetricAlarm;

    readonly cwDownAlarm: aws.cloudwatch.MetricAlarm;

    constructor(
        name: string,
        args: PdDeployTaskArgs,
        opts?: pulumi.ResourceOptions
    ) {
        super('contrib:components:UpdateTask', name, {}, opts);
        const {
            region,
            clusterName,
            tags,
            ecrImage,
            cname,
            healthCheckPath,
            port,
            listenerArn,
            minCapacity,
            maxCapacity,
            scalingAdjustment,
            metricAggregationType,
            period,
            metricName,
            statistic,
            unit,
            threshold,
            evaluationPeriods,
            datapointsToAlarm,
            evaluationPeriodsDown,
            datapointsToAlarmDown,
            scalingAdjustmentDown,
            retentionInDays,
            cpu,
            memory,
            memoryReservation,
            taskRoleArn,
            pathPattern,
            vpcId,
        } = args;

        const cluster = pulumi.output(
            aws.ecs.getCluster({
                clusterName,
            })
        );

        const logGroup = this.createLogGroup(n(name), tags, retentionInDays);

        const task = this.createTask(
            n(name),
            ecrImage,
            port,
            taskRoleArn,
            region,
            tags,
            cpu,
            memory,
            memoryReservation
        );

        const targetGroup = this.createTargetGroup(
            name,
            port,
            vpcId,
            healthCheckPath,
            tags
        );

        const listenerRule = this.createListenerRule(
            n(name),
            listenerArn,
            targetGroup.arn,
            cname,
            pathPattern,
            tags
        );
        const service = this.createService(
            n(name),
            cluster.id,
            task.arn,
            port,
            targetGroup.arn,
            tags
        );
        const ecsTarget = this.createEcsTarget(
            clusterName,
            n(name),
            minCapacity,
            maxCapacity
        );
        const ecsDownPolicy = this.createPolicy(
            ecsTarget.scalableDimension,
            ecsTarget.serviceNamespace,
            ecsTarget.resourceId,
            scalingAdjustmentDown,
            metricAggregationType,
            n(name),
            'down'
        );
        const ecsUpPolicy = this.createPolicy(
            ecsTarget.scalableDimension,
            ecsTarget.serviceNamespace,
            ecsTarget.resourceId,
            scalingAdjustment,
            metricAggregationType,
            n(name),
            'up'
        );
        const cwUpAlarm = this.CreateAlarm(
            n(name),
            'up',
            'GreaterThanOrEqualToThreshold',
            evaluationPeriods,
            datapointsToAlarm,
            clusterName,
            [ecsUpPolicy.arn],
            period,
            metricName,
            statistic,
            unit,
            threshold,
            tags
        );
        const cwDownAlarm = this.CreateAlarm(
            n(name),
            'Down',
            'LessThanOrEqualToThreshold',
            evaluationPeriodsDown,
            datapointsToAlarmDown,
            clusterName,
            [ecsDownPolicy.arn],
            period,
            metricName,
            statistic,
            unit,
            threshold,
            tags
        );

        this.logGroup = logGroup;
        this.service = service;
        this.taskDefinition = task;
        this.listenerRule = listenerRule;
        this.targetGroup = targetGroup;
        this.ecsTarget = ecsTarget;
        this.ecsDownPolicy = ecsDownPolicy;
        this.ecsUpPolicy = ecsUpPolicy;
        this.cwDownAlarm = cwDownAlarm;
        this.cwUpAlarm = cwUpAlarm;
    }

    private createLogGroup(
        name: string,
        tags?: Record<string, string>,
        retentionInDays?: number
    ): aws.cloudwatch.LogGroup {
        return new aws.cloudwatch.LogGroup(
            `/custom/execution-logs/${name}`,
            {
                name: `/custom/execution-logs/${name}`,
                tags,
                retentionInDays: retentionInDays || 180,
            },
            { parent: this }
        );
    }

    private createTask(
        name: string,
        image: string,
        port: number,
        taskRoleArn: pulumi.Input<string>,
        region?: string,
        tags?: Record<string, string>,
        cpu?: number,
        memory?: number,
        memoryReservation?: number
    ): aws.ecs.TaskDefinition {
        return new aws.ecs.TaskDefinition(
            name,
            {
                family: name,
                taskRoleArn,
                containerDefinitions: JSON.stringify([
                    {
                        name,
                        image,
                        cpu: cpu || 128,
                        memory: memory || 4096,
                        memoryReservation: memoryReservation || 256,
                        networkMode: 'bridge',
                        hostname: name,
                        portMappings: [
                            {
                                containerPort: port,
                                hostPort: 80,
                            },
                        ],
                        logConfiguration: {
                            logDriver: 'awslogs',
                            options: {
                                'awslogs-group': `/custom/execution-logs/${name}`,
                                'awslogs-region': `${region}` || 'us-east-2',
                            },
                        },
                        environment: [{ name: 'test', value: 'test' }],
                    },
                ]),
                tags,
            },
            { dependsOn: [this.logGroup], parent: this }
        );
    }

    private createTargetGroup(
        name: string,
        port: number,
        vpcId: pulumi.Input<string>,
        healthCheckPath: string,
        tags?: Record<string, string>
    ): aws.alb.TargetGroup {
        return new aws.alb.TargetGroup(
            `${name}-target`,
            {
                name: `${name}-target`,
                protocol: 'HTTP',
                targetType: 'instance',
                healthCheck: {
                    protocol: 'HTTP',
                    path: healthCheckPath,
                    matcher: '200',
                    timeout: 2,
                    healthyThreshold: 2,
                    interval: 5,
                },
                vpcId,
                port,
                tags,
            },
            { parent: this }
        );
    }

    private createListenerRule(
        name: string,
        listenerArn: string,
        targetGroupArn: pulumi.Input<string>,
        cname: string,
        pathPattern?: string[],
        tags?: Record<string, string>
    ): aws.alb.ListenerRule {
        return new aws.alb.ListenerRule(
            name,
            {
                listenerArn,
                actions: [
                    {
                        type: 'forward',
                        targetGroupArn,
                    },
                ],
                conditions: [
                    {
                        hostHeader: {
                            values: [cname],
                        },
                    },
                    {
                        pathPattern: {
                            values: pathPattern || [`/api/${name}`],
                        },
                    },
                ],
                tags,
            },
            { parent: this }
        );
    }

    private createService(
        name: string,
        cluster: pulumi.Input<string>,
        task: pulumi.Input<string>,
        port: number,
        targetGroupArn: pulumi.Input<string>,
        tags?: Record<string, string>
    ): aws.ecs.Service {
        return new aws.ecs.Service(
            name,
            {
                name,
                cluster,
                taskDefinition: task,
                deploymentMinimumHealthyPercent: 100,
                deploymentMaximumPercent: 200,
                deploymentCircuitBreaker: {
                    enable: true,
                    rollback: true,
                },
                healthCheckGracePeriodSeconds: 120,
                orderedPlacementStrategies: [
                    {
                        type: 'spread',
                        field: 'attribute:ecs.availability-zone',
                    },
                ],
                loadBalancers: [
                    {
                        containerName: `${name}`,
                        containerPort: port,
                        targetGroupArn,
                    },
                ],
                tags,
            },
            {
                dependsOn: [this.taskDefinition, this.targetGroup],
                parent: this,
            }
        );
    }

    private createEcsTarget(
        clusterName: string,
        name: string,
        minCapacity: number,
        maxCapacity: number
    ): aws.appautoscaling.Target {
        return new aws.appautoscaling.Target(
            name,
            {
                maxCapacity,
                minCapacity,
                serviceNamespace: 'ecs',
                resourceId: `service/${clusterName}/${name}`,
                scalableDimension: 'ecs:service:DesiredCount',
            },
            { dependsOn: [this.service], parent: this }
        );
    }

    private createPolicy(
        scalableDimension: pulumi.Input<string>,
        serviceNamespace: pulumi.Input<string>,
        resourceId: pulumi.Input<string>,
        scalingAdjustment: number,
        metricAggregationType: string,
        name: string,
        suffixName: string
    ): aws.appautoscaling.Policy {
        return new aws.appautoscaling.Policy(
            `${name}-${suffixName}`,
            {
                name: `${name}-${suffixName}`,
                resourceId,
                scalableDimension,
                serviceNamespace,
                stepScalingPolicyConfiguration: {
                    cooldown: 60,
                    adjustmentType: 'ChangeInCapacity',
                    metricAggregationType,
                    stepAdjustments: [
                        {
                            metricIntervalUpperBound: '0',
                            scalingAdjustment,
                        },
                    ],
                },
            },
            { dependsOn: [this.ecsTarget], parent: this }
        );
    }

    private CreateAlarm(
        name: string,
        suffixName: string,
        comparisonOperator: string,
        evaluationPeriods: number,
        datapointsToAlarm: number,
        clusterName: string,
        alarmActions: any[],
        period: number,
        metricName: string,
        statistic: string,
        unit: string,
        threshold: number,
        tags?: Record<string, string>
    ): aws.cloudwatch.MetricAlarm {
        return new aws.cloudwatch.MetricAlarm(
            `${name}-${suffixName}`,
            {
                name: `${name}-${suffixName}`,
                comparisonOperator,
                evaluationPeriods,
                datapointsToAlarm,
                dimensions: {
                    ClusterName: clusterName,
                    ServiceName: name,
                },
                alarmActions,
                namespace: 'AWS/ECS',
                period,
                metricName,
                statistic,
                unit,
                threshold,
                tags,
            },
            { dependsOn: [this.ecsUpPolicy, this.ecsDownPolicy], parent: this }
        );
    }
}
