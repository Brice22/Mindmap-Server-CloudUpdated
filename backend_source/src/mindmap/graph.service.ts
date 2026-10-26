// ============================================================
// GRAPH SERVICE - Neo4j answers "how are my nodes connected?"
// ============================================================
// Postgres stays the real copy of everything. Neo4j keeps a COPY of
// the shape of your mindmap, made for following connections:
//   (:Node {id, name, type})
//   (child)-[:CHILD_OF]->(parent)                    parent lines
//   (a)-[:LINK {linkId, typeId, typeName, label}]->(b)   your 🔗 links
//
// Keeping the copy up to date:
//   - rebuilt in full when the backend starts (and whenever Neo4j comes back)
//   - every 15 s a quick fingerprint of nodes + links is checked;
//     if anything changed, the copy is rebuilt (a few thousand nodes
//     takes well under a second)
//   - link changes ask for a rebuild straight away
// If Neo4j is down, the app works as before; only the 🧭 tools wait.
//
// Questions it answers (GraphController, /api/mindmap/graph/...):
//   chain      what leads to this node along one link type (e.g. all
//              Prerequisites, in the order to learn them) or what it leads to
//   path       the shortest chain of lines between two nodes
//   neighbors  everything within 1–3 steps
// ============================================================

import { Injectable, Inject, Logger, OnModuleInit, OnModuleDestroy, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import * as crypto from 'crypto';
import { DatabaseService } from '../database/database.service';
import { Neo4jService } from '../neo4j/neo4j.service';

const CHECK_EVERY_MS = 15_000;
const MAX_STEPS = 12;     // longest chain/path followed

@Injectable()
export class GraphService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GraphService.name);
  private timer: any;
  private fingerprint = '';
  private syncing = false;
  private dirty = true;
  private lastSync: Date | null = null;
  private lastError: string | null = null;
  private counts = { nodes: 0, parents: 0, links: 0, mentions: 0 };

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(Neo4jService) private readonly neo4j: Neo4jService,
  ) {}

  onModuleInit() {
    // First sync after the database has made its tables
    setTimeout(() => this.tick(), 8_000);
    this.timer = setInterval(() => this.tick(), CHECK_EVERY_MS);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  // Something changed (e.g. a link) — rebuild soon
  markDirty() {
    this.dirty = true;
    setTimeout(() => this.tick(), 500);
  }

  status() {
    return {
      connected: !this.lastError && !!this.lastSync,
      lastSync: this.lastSync,
      error: this.lastError,
      ...this.counts,
    };
  }

  // ------------------------------------------------------------
  // KEEPING NEO4J IN STEP WITH POSTGRES
  // ------------------------------------------------------------
  private async currentFingerprint(): Promise<string> {
    const r = await this.db.query(`
    SELECT
        (SELECT COALESCE(string_agg(id || ':' || name || ':' || COALESCE(metadata->>'parent', '') || ':' || COALESCE(metadata->>'type', ''), '|' ORDER BY id), '') FROM mindmap_nodes) AS nodes,
        (SELECT COALESCE(string_agg(l.id || ':' || l.source_id || ':' || l.target_id || ':' || COALESCE(l.type_id, 0) || ':' || COALESCE(l.label, '') || ':' || COALESCE(t.name, ''), '|' ORDER BY l.id), '')
           FROM node_links l LEFT JOIN link_types t ON t.id = l.type_id) AS links,
        (SELECT COALESCE(string_agg(DISTINCT source_node_id || '>' || target_node_id || ':' || kind, '|'), '')
           FROM node_backlinks WHERE source_node_id IS NOT NULL) AS mentions`);
    const row = r.rows[0];
    return crypto.createHash('sha1').update(row.nodes + '#' + row.links + '#' + row.mentions).digest('hex');
  }

  private async tick() {
    if (this.syncing) return;
    this.syncing = true;
    try {
      const fp = await this.currentFingerprint();
      if (this.dirty || fp !== this.fingerprint || this.lastError) {
        await this.rebuild();
        this.fingerprint = fp;
        this.dirty = false;
        if (this.lastError) this.logger.log('Neo4j is back — graph copy rebuilt');
        this.lastError = null;
        this.lastSync = new Date();
      }
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg !== this.lastError) this.logger.warn(`Neo4j sync waiting: ${msg}`);
      this.lastError = msg;
    } finally {
      this.syncing = false;
    }
  }

  // Replace the whole copy in one go (simple, and fast at this size)
  async rebuild() {
    const nodes = (await this.db.query(
      `SELECT id, name, COALESCE(metadata->>'type', '') AS type, NULLIF(TRIM(metadata->>'parent'), '') AS parent FROM mindmap_nodes`,
    )).rows;
    const links = (await this.db.query(
      `SELECT l.id, l.source_id, l.target_id, l.type_id, COALESCE(l.label, '') AS label, COALESCE(t.name, 'No type') AS type_name
       FROM node_links l LEFT JOIN link_types t ON t.id = l.type_id`,
    )).rows;

    // Text in one node's docs/drawings/description that links to or mentions another node
    const mentions = (await this.db.query(
      `SELECT source_node_id AS source, target_node_id AS target,
              CASE WHEN bool_or(kind = 'link') THEN 'link' ELSE 'mention' END AS kind
       FROM node_backlinks
       WHERE source_node_id IS NOT NULL AND source_node_id <> target_node_id
       GROUP BY source_node_id, target_node_id`,
    )).rows;

    // Parent lines are stored by NAME on the child; match names the same way the graph does (ignoring case)
    const byName = new Map<string, number>();
    for (const n of nodes) if (!byName.has(n.name.toLowerCase())) byName.set(n.name.toLowerCase(), n.id);
    const parents = nodes
      .filter(n => n.parent && byName.has(n.parent.toLowerCase()) && byName.get(n.parent.toLowerCase()) !== n.id)
      .map(n => ({ child: n.id, parent: byName.get(n.parent.toLowerCase()) }));

    await this.neo4j.write('CREATE CONSTRAINT hserver_node_id IF NOT EXISTS FOR (n:Node) REQUIRE n.id IS UNIQUE', {});
    await this.neo4j.writeTx([
      { cypher: 'MATCH (n:Node) DETACH DELETE n', params: {} },
      {
        cypher: 'UNWIND $rows AS r CREATE (:Node {id: toInteger(r.id), name: r.name, type: r.type})',
        params: { rows: nodes.map(n => ({ id: n.id, name: n.name, type: n.type })) },
      },
      {
        cypher: `UNWIND $rows AS r
                 MATCH (c:Node {id: toInteger(r.child)}), (p:Node {id: toInteger(r.parent)})
                 CREATE (c)-[:CHILD_OF]->(p)`,
        params: { rows: parents },
      },
      {
        cypher: `UNWIND $rows AS r
                 MATCH (a:Node {id: toInteger(r.source_id)}), (b:Node {id: toInteger(r.target_id)})
                       CREATE (a)-[:LINK {linkId: toInteger(r.id), typeId: toInteger(r.type_id), typeName: r.type_name, label: r.label}]->(b)`,
        params: { rows: links },
      },
      {
        cypher: `UNWIND $rows AS r
                 MATCH (a:Node {id: toInteger(r.source)}), (b:Node {id: toInteger(r.target)})
                 CREATE (a)-[:MENTIONS {kind: r.kind}]->(b)`,
        params: { rows: mentions },
      },
    ]);
    this.counts = { nodes: nodes.length, parents: parents.length, links: links.length, mentions: mentions.length };
    this.logger.log(`Graph copy in Neo4j: ${nodes.length} nodes, ${parents.length} parent lines, ${links.length} links, ${mentions.length} mentions`);
  }

  // ------------------------------------------------------------
  // QUESTIONS
  // ------------------------------------------------------------
  private ready() {
    if (this.lastSync && this.lastError) throw new ServiceUnavailableException(`Neo4j isn't reachable right now (${this.lastError})`);
    if (!this.lastSync) throw new ServiceUnavailableException(this.lastError ? `Neo4j isn't reachable yet (${this.lastError})` : 'Neo4j is still starting — try again in a few seconds');
  }

  private id(v: any, what = 'node'): number {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) throw new BadRequestException(`Pick a ${what}`);
    return n;
  }

  // Lines along a path, for highlighting (queries return each line's ends as a → b)
  private edgesOf(rels: any[]) {
    return rels.map(r => ({ from: Number(r.a), to: Number(r.b), kind: r.kind, typeName: r.typeName ?? null, label: r.label ?? '' }));
  }

  // Everything that leads to this node along one link type ("before"),
  // or everything it leads to ("after"). Nodes come back in learning order:
  // furthest first, so working down the list respects every arrow.
  async chain(nodeId: any, typeId: any, direction: 'before' | 'after' = 'before') {
    this.ready();
    const id = this.id(nodeId);
    const t = this.id(typeId, 'link type');
    const pattern = direction === 'after'
      ? `(n:Node {id: $id})-[:LINK*1..${MAX_STEPS}]->(m:Node)`
      : `(m:Node)-[:LINK*1..${MAX_STEPS}]->(n:Node {id: $id})`;
    const res = await this.neo4j.read(
      `MATCH p = ${pattern}
       WHERE all(r IN relationships(p) WHERE r.typeId = $t) AND m.id <> $id
       WITH m, p ORDER BY length(p) DESC
       WITH m, max(length(p)) AS depth, collect(p)[0] AS p
       RETURN m.id AS id, m.name AS name, depth,
              [r IN relationships(p) | {a: startNode(r).id, b: endNode(r).id, kind: 'link', typeName: r.typeName, label: r.label}] AS rels
       ORDER BY depth DESC, name`,
      { id, t },
    );
    const rows = res.records.map(r => r.toObject());
    const nodes = rows.map(r => ({ id: Number(r.id), name: r.name, depth: Number(r.depth) }));
    const seen = new Set<string>();
    const edges = this.edgesOf(rows.flatMap(r => r.rels)).filter(e => {
      const k = `${e.from}-${e.to}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return { nodeId: id, typeId: t, direction, nodes, edges };
  }

  // Shortest chain of lines (parent lines and links, any direction) between two nodes
  async path(fromId: any, toId: any) {
    this.ready();
    const from = this.id(fromId), to = this.id(toId);
    if (from === to) throw new BadRequestException('Pick two different nodes');
    const res = await this.neo4j.read(
      `MATCH (a:Node {id: $from}), (b:Node {id: $to})
             MATCH p = shortestPath((a)-[*..${MAX_STEPS}]-(b))
       RETURN [n IN nodes(p) | {id: n.id, name: n.name}] AS nodes,
              [r IN relationships(p) | {a: startNode(r).id, b: endNode(r).id,
                 kind: CASE type(r) WHEN 'CHILD_OF' THEN 'parent' WHEN 'MENTIONS' THEN 'mention' ELSE 'link' END,
                 typeName: r.typeName, label: r.label}] AS rels`,
      { from, to },
    );
    const rec = res.records[0];
    if (!rec) return { from, to, found: false, nodes: [], edges: [] };
    return {
      from, to, found: true,
      nodes: rec.get('nodes').map((n: any) => ({ id: Number(n.id), name: n.name })),
      edges: this.edgesOf(rec.get('rels')),
    };
  }

  // Everything within 1–3 steps (any kind of line, any direction)
  async neighbors(nodeId: any, depth: any = 2) {
    this.ready();
    const id = this.id(nodeId);
    const d = Math.min(3, Math.max(1, Math.round(Number(depth) || 2)));
    const res = await this.neo4j.read(
      `MATCH p = (n:Node {id: $id})-[*1..${d}]-(m:Node)
       WHERE m.id <> $id
       WITH m, min(length(p)) AS steps
       RETURN m.id AS id, m.name AS name, steps
       ORDER BY steps, name
       LIMIT 300`,
      { id },
    );
    const nodes = res.records.map(r => ({ id: Number(r.get('id')), name: r.get('name'), steps: Number(r.get('steps')) }));
    // the lines between all of these (and the start node), for highlighting
       const ids = [id, ...nodes.map(n => n.id)];
    const lines = await this.neo4j.read(
      `MATCH (a:Node)-[r]->(b:Node) WHERE a.id IN $ids AND b.id IN $ids
       RETURN a.id AS a, b.id AS b, CASE type(r) WHEN 'CHILD_OF' THEN 'parent' WHEN 'MENTIONS' THEN 'mention' ELSE 'link' END AS kind, r.typeName AS typeName, r.label AS label`,
      { ids },
    );
    return { nodeId: id, depth: d, nodes, edges: this.edgesOf(lines.records.map(r => r.toObject())) };
  }
}