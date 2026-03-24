import { Controller, Post, Body, Get } from '@nestjs/common';
import { execSync } from 'child_process';

@Controller('vpn')
export class VpnController {
  // Returns current WireGuard status
  @Get('status')
  getStatus() {
    try {
      const output = execSync('wg show').toString();
      return { connected: true, info: output };
    } catch {
      return { connected: false };
    }
  }

  // Switch exit node location (only works with Option B above)
  @Post('switch')
  
  switchLocation(@Body() body: { location: string }) {
    // This would swap WireGuard peer configs
    // Implementation depends on your VPS setup
    return { switched: body.location };
  }
}