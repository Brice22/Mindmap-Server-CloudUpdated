import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Controller('vpn')
export class VpnController {
  private readonly exitDir = '/app/vpn-configs';
  private currentExit: string = 'direct';

  @Get('status')
  getStatus() {
    return {
      currentExit: this.currentExit,
      availableExits: this.getAvailableExits(),
    };
  }

  @Get('exits')
  getAvailableExits(): string[] {
    try {
      const dir = path.join(this.exitDir);
      if (!fs.existsSync(dir)) return ['direct'];
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.conf'));
      return ['direct', ...files.map(f => f.replace('.conf', ''))];
    } catch {
      return ['direct', 'tor'];
    }
  }

  @Post('switch')
  switchLocation(@Body() body: { location: string }) {
    this.currentExit = body.location;
    // Write selection to shared volume so WireGuard container can read it
    try {
      fs.writeFileSync(
        path.join(this.exitDir, 'active-exit.txt'),
        body.location
      );
    } catch (e: any) {
      // Volume not mounted locally — that's fine
    }
    return { switched: body.location, message: `Exit node set to ${body.location}` };
  }
@Get('peers')
  getPeers() {
    try {
      const peersDir = path.join(this.exitDir, '..', 'peer_*');
      // List peer directories
      const configDir = '/app/vpn-configs';
      if (!fs.existsSync(configDir)) return [];
      return fs.readdirSync(configDir)
        .filter(f => f.startsWith('peer_'))
        .map(f => ({
          name: f.replace('peer_', ''),
          configPath: path.join(configDir, f),
          hasConfig: fs.existsSync(path.join(configDir, f, `${f}.conf`)),
        }));
    } catch {
      return [];
    }
  }

  @Post('peers')
  addPeer(@Body() body: { name: string }) {
    // Write peer request — WireGuard container reads PEERS env on restart
    try {
      const filePath = path.join(this.exitDir, 'pending-peers.json');
      let pending: string[] = [];
      if (fs.existsSync(filePath)) {
        pending = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
      pending.push(body.name.toLowerCase().replace(/[^a-z0-9]/g, ''));
      fs.writeFileSync(filePath, JSON.stringify(pending));
      return { added: body.name, message: 'Restart WireGuard container to generate config' };
    } catch {
      return { error: 'Cannot write peer config' };
    }
  }

  @Get('peers/:name/config')
  getPeerConfig(@Param('name') name: string) {
    try {
      const confPath = path.join('/app/vpn-configs', `peer_${name}`, `peer_${name}.conf`);
      if (fs.existsSync(confPath)) {
        return { config: fs.readFileSync(confPath, 'utf8') };
      }
      return { error: 'Config not found. Restart WireGuard container first.' };
    } catch {
      return { error: 'Cannot read config' };
    }
  }

}