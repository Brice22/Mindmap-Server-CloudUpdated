import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Inject, forwardRef } from '@nestjs/common'; // <--- Import these
import { MindmapService } from './mindmap.service';

@WebSocketGateway({
  path: '/socket.io/',
  cors: { origin: '*' }, // Allows your Frontend to connect
  namespace: 'mindmap',
})
export class MindmapGateway {
  @WebSocketServer()
  server: Server;

  constructor(
       @Inject(forwardRef(() => MindmapService))
       private readonly mindmapService: MindmapService) {console.log("DEBUG: MindmapGateway initialized.");}

  @SubscribeMessage('node_move')
  handleNodeMove(
    @MessageBody() data: { id: string; x: number; y: number },
    @ConnectedSocket() client: Socket,
  ) {
    client.broadcast.emit('node_moved', data);
  }

  @SubscribeMessage('node_drag_end')
  async handleDragEnd(@MessageBody() data: { id: string; x: number; y: number }) {
    console.log(`GATEWAY: Request to save Node ${data.id} at ${data.x}, ${data.y}`);
    
    try {
      if (!this.mindmapService) {
        console.error("DEBUG: 'this.mindmapService' is still undefined!");
        throw new Error("CRITICAL: MindmapService injection failed.");
      }

      // Convert inputs explicitly to ensure no NaNs get passed
      const safeId = Number(data.id);
      const safeX = Math.round(data.x);
      const safeY = Math.round(data.y);

      console.log(`GATEWAY: Calling service with ID: ${safeId}, X: ${safeX}, Y: ${safeY}`);

      const result = await this.mindmapService.updateNode(
        safeId,
        undefined, // name
        undefined, // description
        undefined, // extraMeta
        safeX,
        safeY
      );

      console.log(`GATEWAY: Service returned successfully:`, result ? "Saved" : "Null (Not Found)");
      
    } catch (e) {
      console.error("GATEWAY ERROR: Save failed!", e.message);
      console.error(e.stack);
    }
  }
}
