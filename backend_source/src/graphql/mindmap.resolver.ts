// ============================================================
// MINDMAP RESOLVER - GraphQL API
// ============================================================
// PURPOSE: Handles GraphQL queries (an alternative to REST API).
//
// REST vs GraphQL:
// - REST: Fixed endpoints that return fixed data shapes
//   GET /api/mindmap → returns ALL fields for ALL nodes
//
// - GraphQL: Client specifies exactly what data it wants
//   query { nodes { id name } } → returns ONLY id and name
//
// WHY BOTH?
// - REST is simpler for basic CRUD
// - GraphQL is better for complex queries and mobile apps
//   (reduces bandwidth by only fetching needed fields)
// ============================================================

import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { NodesService } from '../mindmap/nodes/nodes.service';
import { RelationshipsService } from '../mindmap/relationships/relationships.service';

@Resolver()
export class MindmapResolver {
  constructor(
    private nodesService: NodesService,
    private relService: RelationshipsService,
  ) {}

  // ============================================================
  // QUERY: getFullMap
  // ============================================================
  // Returns all nodes in the mindmap.
  //
  // GRAPHQL USAGE:
  //   query {
  //     getFullMap {
  //       nodes { id name description }
  //     }
  //   }
  //
  // FIX: Changed findAllNodes() → this method now exists in NodesService
  // ============================================================
  @Query()
  async getFullMap() {
    const nodes = await this.nodesService.findAllNodes();
    return { nodes };
  }

  // ============================================================
  // QUERY: getNode
  // ============================================================
  // Returns a single node by ID.
  //
  // GRAPHQL USAGE:
  //   query {
  //     getNode(id: 42) {
  //       id name description metadata
  //     }
  //   }
  // ============================================================
  @Query()
  async getNode(@Args('id') id: number) {
    return await this.nodesService.findOne(id);
  }

  // ============================================================
  // QUERY: getFamilyTree
  // ============================================================
  // Returns only 'person' type nodes for the family tree view.
  // ============================================================
  @Query()
  async getFamilyTree() {
    const nodes = await this.nodesService.findAllNodes('person');
    return { nodes };
  }

  // ============================================================
  // MUTATION: addFamilyMember
  // ============================================================
  // Creates a new person node and links them to a parent.
  //
  // GRAPHQL USAGE:
  //   mutation {
  //     addFamilyMember(name: "John Jr", parent: "John Sr") {
  //       id name
  //     }
  //   }
  //
  // FIX: Changed createNode() → createNode() now exists
  // FIX: Changed createRelationship() → this method now exists
  // ============================================================
  @Mutation()
  async addFamilyMember(
    @Args('name') name: string,
    @Args('parent') parent: string
  ) {
    // Create the person node with parent in metadata
    const node = await this.nodesService.createNode(name, '', { 
      parent,
      type: 'person' 
    });

    // Create the relationship in Neo4j
    if (parent) {
      await this.relService.createRelationship(parent, name, 'PARENT_OF');
    }

    return node;
  }

  // ============================================================
  // MUTATION: createNode
  // ============================================================
  // Creates a generic node (not necessarily a person).
  //
  // GRAPHQL USAGE:
  //   mutation {
  //     createNode(name: "Biology", type: "concept") {
  //       id name
  //     }
  //   }
  // ============================================================
  @Mutation()
  async createNode(
    @Args('name') name: string,
    @Args('description') description: string = '',
    @Args('type') type: string = 'default'
  ) {
    return await this.nodesService.createNode(name, description, { type });
  }

  // ============================================================
  // MUTATION: linkNodes
  // ============================================================
  // Creates a relationship between two existing nodes.
  //
  // GRAPHQL USAGE:
  //   mutation {
  //     linkNodes(from: "Biology", to: "Science", relation: "CHILD_OF")
  //   }
  // ============================================================
  @Mutation()
  async linkNodes(
    @Args('from') from: string,
    @Args('to') to: string,
    @Args('relation') relation: string = 'CHILD_OF'
  ) {
    await this.relService.createRelationship(from, to, relation);
    return { success: true };
  }
}
