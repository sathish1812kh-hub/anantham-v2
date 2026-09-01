import { type SqliteEngine } from "../persistence/sqlite-engine.js";
import { type EventStore } from "../event-state/event-store.js";
import { type ProjectRepository } from "../persistence/repositories/project-repository.js";
import { type SessionRepository } from "../persistence/repositories/session-repository.js";
import { type TaskRepository } from "../persistence/repositories/task-repository.js";
import { type ArtifactRepository } from "../persistence/repositories/artifact-repository.js";
import { IntegrationRepository } from "../persistence/repositories/integration-repository.js";
import { WebhookSubscriptionRepository } from "../persistence/repositories/webhook-subscription-repository.js";
import { WebhookDeliveryRepository } from "../persistence/repositories/webhook-delivery-repository.js";
import { WebhookIngestionEngine } from "./webhook-ingestion-engine.js";
import { WebhookDispatcher, type HttpSender } from "./webhook-dispatcher.js";
import { CicdAdapter } from "./cicd-adapter.js";
import { IdeAdapter } from "./ide-adapter.js";
import { type CommandRegistry } from "../cli/command-registry.js";

export interface IntegrationManagerOptions {
  engine: SqliteEngine;
  eventStore: EventStore;
  projectRepo: ProjectRepository;
  sessionRepo: SessionRepository;
  taskRepo: TaskRepository;
  artifactRepo: ArtifactRepository;
  commandRegistry?: CommandRegistry;
  httpSender?: HttpSender;
}

/**
 * Integration Subsystem Container and Lifecycle Manager.
 * PRD Part 2 Section 220–250.
 */
export class IntegrationManager {
  public readonly integrationRepo: IntegrationRepository;
  public readonly subscriptionRepo: WebhookSubscriptionRepository;
  public readonly deliveryRepo: WebhookDeliveryRepository;

  public readonly ingestionEngine: WebhookIngestionEngine;
  public readonly dispatcher: WebhookDispatcher;
  public readonly cicdAdapter: CicdAdapter;
  public readonly ideAdapter: IdeAdapter;

  constructor(options: IntegrationManagerOptions) {
    this.integrationRepo = new IntegrationRepository(options.engine);
    this.subscriptionRepo = new WebhookSubscriptionRepository(options.engine);
    this.deliveryRepo = new WebhookDeliveryRepository(options.engine);

    this.ingestionEngine = new WebhookIngestionEngine({
      eventStore: options.eventStore,
      integrationRepo: this.integrationRepo,
    });

    this.dispatcher = new WebhookDispatcher({
      eventStore: options.eventStore,
      subscriptionRepo: this.subscriptionRepo,
      deliveryRepo: this.deliveryRepo,
      httpSender: options.httpSender,
    });

    this.cicdAdapter = new CicdAdapter({
      taskRepo: options.taskRepo,
      sessionRepo: options.sessionRepo,
      eventStore: options.eventStore,
    });

    this.ideAdapter = new IdeAdapter({
      projectRepo: options.projectRepo,
      sessionRepo: options.sessionRepo,
      taskRepo: options.taskRepo,
      artifactRepo: options.artifactRepo,
      commandRegistry: options.commandRegistry,
    });
  }

  public start(): void {
    this.dispatcher.start();
  }

  public stop(): void {
    this.dispatcher.stop();
  }
}
