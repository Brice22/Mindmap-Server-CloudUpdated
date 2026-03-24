import { Injectable } from '@nestjs/common';
import { MindmapService } from '../mindmap/mindmap.service';

@Injectable()
export class FamilyService {
  constructor(private readonly mindmap: MindmapService) {}

  async createFamilyMember(name: string, bio: string) {
    // This uses the Mindmap layer to create the base "Node"
    return this.mindmap.createNode(name, bio, 'family_member');
  }
}
