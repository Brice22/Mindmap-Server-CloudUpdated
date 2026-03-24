import { Test, TestingModule } from '@nestjs/testing';
import { MindmapService } from './mindmap.service';
import { DatabaseService } from '../database/database.service';

describe('MindmapService', () => {
  let service: MindmapService;
  let mockDb: any;

  beforeEach(async () => {
    // We create a mock version of the DatabaseService
    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [{ id: 1, name: 'Sylar' }] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MindmapService,
        { provide: DatabaseService, useValue: mockDb },
        { provide: 'NEO4J_DRIVER', useValue: { session: jest.fn() } },
        { provide: 'MEILISEARCH_CLIENT', useValue: { index: jest.fn() } },
      ],
    }).compile();

    service = module.get<MindmapService>(MindmapService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should call database query when creating a node', async () => {
    // Using the actual method name from your service
    await service.createNode('Sylar', 'Test Description', {});
    expect(mockDb.query).toHaveBeenCalled();
  });
});
