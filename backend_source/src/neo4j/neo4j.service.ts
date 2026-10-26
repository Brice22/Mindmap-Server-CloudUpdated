// ============================================================
// NEO4J SERVICE - talks to the Neo4j graph database
// ============================================================
// write / read run one Cypher query; writeTx runs several in ONE
// transaction (all or nothing — used to rebuild the graph copy).
// Whole numbers in params are sent as Neo4j integers (JavaScript
// would send 5 as 5.0), and integers come back as normal numbers.
// ============================================================

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import neo4j, { Driver } from 'neo4j-driver';

// 5 → neo4j.int(5), also inside arrays and objects
function toNeo(v: any): any {
  if (typeof v === 'number' && Number.isInteger(v)) return neo4j.int(v);
  if (Array.isArray(v)) return v.map(toNeo);
  if (v && typeof v === 'object' && v.constructor === Object) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toNeo(x)]));
  }
  return v;
}

@Injectable()
export class Neo4jService implements OnModuleInit, OnModuleDestroy {
  private driver: Driver;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    this.driver = neo4j.driver(
      this.config.get('NEO4J_URI') || 'bolt://neo4j:7687',
      neo4j.auth.basic(
        this.config.get('NEO4J_USER') || 'neo4j',
        this.config.get('NEO4J_PASSWORD') || 'password'
      ),
      { disableLosslessIntegers: true, connectionTimeout: 5000, maxTransactionRetryTime: 5000 },
    );
  }

  async write(cypher: string, params: any = {}) {
    const session = this.driver.session({ defaultAccessMode: neo4j.session.WRITE });
    try {
      return await session.run(cypher, toNeo(params));
    } finally {
      await session.close();
    }
  }

  async read(cypher: string, params: any = {}) {
    const session = this.driver.session({ defaultAccessMode: neo4j.session.READ });
    try {
      return await session.run(cypher, toNeo(params));
    } finally {
      await session.close();
    }
  }

  // Several queries in one transaction: all of them happen, or none
  async writeTx(steps: { cypher: string; params?: any }[]) {
    const session = this.driver.session({ defaultAccessMode: neo4j.session.WRITE });
    try {
      await session.executeWrite(async tx => {
        for (const s of steps) await tx.run(s.cypher, toNeo(s.params || {}));
      });
    } finally {
      await session.close();
    }
  }

  async onModuleDestroy() {
    if (this.driver) {
      await this.driver.close();
    }
