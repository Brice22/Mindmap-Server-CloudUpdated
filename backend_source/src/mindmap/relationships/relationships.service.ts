// ============================================================
// RELATIONSHIPS SERVICE - Graph Database Operations
// ============================================================
// PURPOSE: Manages parent→child relationships in Neo4j.
//
// Neo4j uses CYPHER query language (like SQL for graphs):
// - CREATE (a:Person {name: 'John'})  → Create a node
// - MATCH (a)-[:KNOWS]->(b)           → Find connected nodes
// - MERGE                              → Create if not exists
//
// WHY RELATIONSHIPS MATTER:
// In a family tree, you need to answer questions like:
// - "Who are John's children?"
// - "Who are the ancestors of Mary?"
// SQL can do this with JOINs, but Neo4j is 100x faster for deep traversals.
// ============================================================

import { Injectable, Inject } from '@nestjs/common';
import { Neo4jService } from '../../neo4j/neo4j.service';

@Injectable()
export class RelationshipsService {
  constructor(
    @Inject(Neo4jService) private readonly neo4j: Neo4jService
  ) {}

  // ============================================================
  // LINK FAMILY
  // ============================================================
  // Creates a PARENT_OF relationship between two people.
  //
  // CYPHER EXPLAINED:
  //   MERGE (p:Person {name: $parentName})
  //   → Find or create a Person node with this name
  //
  //   MERGE (c:Person {name: $childName})
  //   → Find or create the child node
  //
  //   CREATE (p)-[r:PARENT_OF]->(c)
  //   → Draw an arrow from parent to child labeled "PARENT_OF"
  //
  // PARAMETERS:
  //   parentName - The parent's name
  //   childName  - The child's name
  // ============================================================
  async linkFamily(parentName: string, childName: string) {
    const cypher = `
      MERGE (p:Person {name: $parentName})
      MERGE (c:Person {name: $childName})
      CREATE (p)-[r:PARENT_OF]->(c)
      RETURN r
    `;

    return this.neo4j.write(cypher, { parentName, childName });
  }

  // ============================================================
  // CREATE RELATIONSHIP (Generic)
  // ============================================================
  // FIX: Added this method - was missing but called by GraphQL resolver
  //
  // Creates any type of relationship between two nodes.
  //
  // PARAMETERS:
  //   fromName     - Source node name
  //   toName       - Target node name  
  //   relationship - Type like 'PARENT_OF', 'CHILD_OF', 'RELATED_TO'
  // ============================================================
  async createRelationship(
    fromName: string,
    toName: string,
    relationship: string = 'RELATED_TO'
  ) {
    // Sanitize relationship type (only allow alphanumeric and underscore)
    const safeRelType = relationship.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase();

    const cypher = `
      MERGE (a:Node {name: $fromName})
      MERGE (b:Node {name: $toName})
      CREATE (a)-[r:${safeRelType}]->(b)
      RETURN r
    `;

    return this.neo4j.write(cypher, { fromName, toName });
  }

  // ============================================================
  // LINK NODES BY ID
  // ============================================================
  // Same as above but uses PostgreSQL IDs instead of names.
  // More reliable since IDs are unique, names might not be.
  //
  // PARAMETERS:
  //   fromId - Source node's PostgreSQL ID
  //   toId   - Target node's PostgreSQL ID
  //   type   - Relationship type
  // ============================================================
  async linkNodesById(fromId: number, toId: number, type: string = 'CHILD_OF') {
    const safeType = type.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase();

    const cypher = `
      MERGE (a:Node {pgId: $fromId})
      MERGE (b:Node {pgId: $toId})
      MERGE (a)-[r:${safeType}]->(b)
      RETURN r
    `;

    return this.neo4j.write(cypher, { fromId, toId });
  }

  // ============================================================
  // FIND CHILDREN
  // ============================================================
  // Returns all direct children of a node.
  //
  // CYPHER PATTERN:
  //   (parent)-[:CHILD_OF]->(child)
  //   This reads: "find nodes where child CHILD_OF parent"
  //   Which means: find children of the parent
  // ============================================================
  async findChildren(parentId: number) {
    const cypher = `
      MATCH (child:Node)-[:CHILD_OF]->(parent:Node {pgId: $parentId})
      RETURN child.pgId as id, child.name as name
    `;

    const result = await this.neo4j.read(cypher, { parentId });
    return result.records.map(record => ({
      id: record.get('id'),
      name: record.get('name'),
    }));
  }

  // ============================================================
  // FIND ANCESTORS
  // ============================================================
  // Returns ALL ancestors (parents, grandparents, etc.)
  //
  // CYPHER *1.. SYNTAX:
  //   -[:CHILD_OF*1..]-
  //   The *1.. means "follow 1 or more CHILD_OF edges"
  //   This traverses up the entire family tree
  // ============================================================
  async findAncestors(nodeId: number) {
    const cypher = `
      MATCH (node:Node {pgId: $nodeId})-[:CHILD_OF*1..]->(ancestor:Node)
      RETURN DISTINCT ancestor.pgId as id, ancestor.name as name
    `;

    const result = await this.neo4j.read(cypher, { nodeId });
    return result.records.map(record => ({
      id: record.get('id'),
      name: record.get('name'),
    }));
  }

  // ============================================================
  // FIND DESCENDANTS
  // ============================================================
  // Returns ALL descendants (children, grandchildren, etc.)
  // ============================================================
  async findDescendants(nodeId: number) {
    const cypher = `
      MATCH (descendant:Node)-[:CHILD_OF*1..]->(node:Node {pgId: $nodeId})
      RETURN DISTINCT descendant.pgId as id, descendant.name as name
    `;

    const result = await this.neo4j.read(cypher, { nodeId });
    return result.records.map(record => ({
      id: record.get('id'),
      name: record.get('name'),
    }));
  }

  // ============================================================
  // REMOVE RELATIONSHIP
  // ============================================================
  // Deletes a relationship between two nodes.
  // ============================================================
  async removeRelationship(fromId: number, toId: number, type?: string) {
    let cypher: string;
    
    if (type) {
      const safeType = type.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase();
      cypher = `
        MATCH (a:Node {pgId: $fromId})-[r:${safeType}]->(b:Node {pgId: $toId})
        DELETE r
      `;
    } else {
      // Delete any relationship between these nodes
      cypher = `
        MATCH (a:Node {pgId: $fromId})-[r]->(b:Node {pgId: $toId})
        DELETE r
      `;
    }

    return this.neo4j.write(cypher, { fromId, toId });
  }
}
