import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601 } from 'class-validator';
import { IsIanaTimezone } from '../../common/validators/is-iana-timezone.validator';

export class AvailabilityQueryDto {
  @ApiProperty({ example: '2026-09-21', description: 'Primeiro dia consultado (YYYY-MM-DD).' })
  @IsISO8601({ strict: true })
  startDate!: string;

  @ApiProperty({ example: '2026-09-30', description: 'Último dia consultado, inclusive.' })
  @IsISO8601({ strict: true })
  endDate!: string;

  @ApiProperty({ example: 'America/Sao_Paulo', description: 'Timezone do visitante.' })
  @IsIanaTimezone()
  timezone!: string;
}
