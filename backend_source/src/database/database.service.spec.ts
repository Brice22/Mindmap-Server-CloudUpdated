import { Test } from '@nestjs/testing';
import { DatabaseService } from './database.service';
import { ConfigService } from '@nestjs/config';

describe('DatabaseService (Foundation Test)', () => {
  let service: DatabaseService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config = {
        DB_HOST: '10.10.0.1',
        DB_PORT: 5432,
        DB_USER: 'sylar546'
      };
      return config[key];
    }),
  };

  it('should initialize the Postgres Pool with correct config', async () => {
    const module = await Test.createTestingModule({
      providers: [
        DatabaseService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<DatabaseService>(DatabaseService);
    expect(service).toBeDefined();
    expect(mockConfigService.get).toHaveBeenCalledWith('DB_HOST');
  });
});
