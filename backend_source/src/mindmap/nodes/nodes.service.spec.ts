import { Test, TestingModule } from '@nestjs/testing';
import { NodesService } from './nodes.service';
import { DatabaseService } from '../../database/database.service';

describe('NodesService', () => {
  let service: NodesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NodesService,
        {
          provide: DatabaseService,
          useValue: { query: jest.fn().mockResolvedValue({ rows: [{ id: 1 }] }) },
        },
      ],
    }).compile();

    service = module.get<NodesService>(NodesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return a node after creation', async () => {
    const node = await service.createNode('Grandpa', 'Bio', {});
    expect(node.id).toEqual(1);
  });
});
