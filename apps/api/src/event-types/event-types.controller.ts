import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { EventTypesService } from './event-types.service';
import { CreateEventTypeDto, UpdateEventTypeDto } from './dto/event-type.dto';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('event-types')
@Controller('event-types')
export class EventTypesController {
  constructor(private readonly service: EventTypesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista os tipos de evento do host.' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Cria um tipo de evento.' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateEventTypeDto) {
    return this.service.create(user.id, user.workspaceId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha um tipo de evento.' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(user.id, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualiza um tipo de evento.' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventTypeDto,
  ) {
    return this.service.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove (soft delete) um tipo de evento.' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(user.id, id);
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Duplica um tipo de evento.' })
  duplicate(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.duplicate(user.id, user.workspaceId, id);
  }
}
