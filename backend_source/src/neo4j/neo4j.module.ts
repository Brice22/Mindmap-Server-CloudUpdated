// ============================================================
// NEO4J MODULE - Wiring Hub for Graph Database
// ============================================================
// PURPOSE: Makes Neo4jService available to other modules.
//
// HOW NESTJS MODULES WORK:
// - providers: Services that THIS module creates and manages
// - exports: Services that OTHER modules can use when they import this
//
// Without 'exports', the service would be private to this module.
// ============================================================

import { Module, Global } from '@nestjs/common';
import { Neo4jService } from './neo4j.service';

// @Global() means any module can use Neo4jService without importing Neo4jModule
// We do this because graph queries are needed everywhere
@Global()
@Module({
  providers: [Neo4jService],  // Create the service
  exports: [Neo4jService],    // Let others use it
})
export class Neo4jModule {}
