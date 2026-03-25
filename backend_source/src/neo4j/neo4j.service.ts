import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import neo4j, { Driver } from 'neo4j-driver';

@Injectable()
export class Neo4jService implements OnModuleInit, OnModuleDestroy {
  private driver: Driver;

	constructor(private config: ConfigService) {}

  // This connects the "Brain" to the Graph on startup
  onModuleInit() {
    this.driver = neo4j.driver(
      'bolt://10.10.0.1:7687', 
      neo4j.auth.basic('neo4j', 'password')
    );
  }

  // This runs the Cypher query
  async write(cypher: string, params: any) {
    const session = this.driver.session();
    try {
      return await session.run(cypher, params);
    } finally {
      await session.close();
    }
  }

  async read(cypher: string, params: any) {
    const session = this.driver.session({ defaultAccessMode: neo4j.session.READ });
    try {
      return await session.run(cypher, params);
    } finally {
      await session.close();
    }
  }
   async onModuleDestroy() {
    if (this.driver) {
      await this.driver.close();
    }
  }
}
