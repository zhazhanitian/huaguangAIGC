import { Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Socket, Server } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { RealtimeService } from './realtime.service';
import { userRoom } from './realtime.types';

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class RealtimeGateway {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly realtimeService: RealtimeService,
  ) {}

  afterInit() {
    this.realtimeService.setServer(this.server);
    this.logger.log('Socket.IO gateway initialized');
  }

  async handleConnection(client: Socket) {
    const token = this.extractToken(client);
    if (!token) {
      this.logger.debug(`reject connection: missing token socket=${client.id}`);
      client.disconnect(true);
      return;
    }

    try {
      // Payload shape depends on your JwtStrategy; we only need user id.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = await this.jwtService.verifyAsync(token);
      const userId = String(payload?.id || payload?.sub || payload?.userId || '').trim();
      if (!userId) {
        this.logger.debug(`reject connection: invalid payload socket=${client.id}`);
        client.disconnect(true);
        return;
      }

      client.data.userId = userId;
      client.join(userRoom(userId));
      this.logger.debug(`connected user=${userId} socket=${client.id}`);
    } catch (err) {
      this.logger.debug(
        `reject connection: jwt verify failed socket=${client.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = String(client.data?.userId || '');
    this.logger.debug(`disconnected user=${userId || '-'} socket=${client.id}`);
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) return authToken.trim();

    const header = client.handshake.headers?.authorization;
    if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
      return header.slice('bearer '.length).trim() || null;
    }
    return null;
  }
}

