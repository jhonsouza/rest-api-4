import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import { Container } from "@pulumi/aws/mediastore";

const monetization_cluster = new aws.ecs.Cluster("monetization_cluster", {
    settings: [{
        name: "containerInsights",
        value: "enabled",
    }],
    name: "monetization_cluster"
})

const payment_task = new aws.ecs.TaskDefinition("payemnt_task", {
    family: "payment_task",
    containerDefinitions: JSON.stringify([
        {
            name: "payment_api",
            image: "jhonatans/test",
            cpu: 10,
            memory: 512,
            essential: true,
            portMappings: [{
                containerPort: 3000,
                hostPort: 80
            }]
        }
    ])
})

const payment_api = new aws.ecs.Service("payment_api",{
    name: "payment_api",
    cluster: monetization_cluster.id,
    taskDefinition: payment_task.arn,
    orderedPlacementStrategies: [{
        type: "binpack",
        field: "cpu",
    }],
    desiredCount: 1 

})