import { Injectable, OnModuleInit } from '@nestjs/common';
import * as client from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  private register: client.Registry;

  // Counters
  public httpRequests: client.Counter;
  public nodeCreations: client.Counter;
  public nodeDeletions: client.Counter;
  public searchQueries: client.Counter;
  public wsConnections: client.Gauge;

  // Histograms
  public httpDuration: client.Histogram;
  public dbQueryDuration: client.Histogram;

  onModuleInit() {
    this.register = new client.Registry();

    // Default Node.js metrics (memory, CPU, event loop)
    client.collectDefaultMetrics({ register: this.register });

    this.httpRequests = new client.Counter({
      name: 'hserver_http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status'],
      registers: [this.register],
    });

    this.nodeCreations = new client.Counter({
      name: 'hserver_nodes_created_total',
      help: 'Total nodes created',
      registers: [this.register],
    });

    this.nodeDeletions = new client.Counter({
      name: 'hserver_nodes_deleted_total',
      help: 'Total nodes deleted',
      registers: [this.register],
    });

    this.searchQueries = new client.Counter({
      name: 'hserver_search_queries_total',
      help: 'Total search queries',
      registers: [this.register],
    });

    this.wsConnections = new client.Gauge({
      name: 'hserver_websocket_connections',
      help: 'Active WebSocket connections',
      registers: [this.register],
    });

    this.httpDuration = new client.Histogram({
      name: 'hserver_http_duration_seconds',
      help: 'HTTP request duration',
      labelNames: ['method', 'route'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
      registers: [this.register],
    });

    this.dbQueryDuration = new client.Histogram({
      name: 'hserver_db_query_duration_seconds',
      help: 'Database query duration',
      labelNames: ['operation'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5],
      registers: [this.register],
    });
  }

  async getMetrics(): Promise<string> {
    return this.register.metrics();
  }

  getContentType(): string {
    return this.register.contentType;
  }
}