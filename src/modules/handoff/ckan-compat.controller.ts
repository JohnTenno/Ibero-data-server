import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { HandoffService } from './handoff.service.js';

@Controller('api/3/action')
export class CkanCompatController {
  constructor(private readonly handoffService: HandoffService) {}

  @Post('duckdb_consume_handoff')
  @HttpCode(HttpStatus.OK)
  consumeHandoff(@Body('token') token?: string) {
    if (!token || token.length > 128) {
      return { success: false, error: { message: 'Invalid token' } };
    }

    const payload = this.handoffService.consume(token);
    if (!payload) {
      return { success: false, error: { message: 'Invalid or expired handoff token' } };
    }

    return {
      success: true,
      result: {
        username: payload.username,
        display_name: payload.displayName,
        download_token: payload.downloadToken,
      },
    };
  }
}
