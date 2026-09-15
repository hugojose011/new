import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsOptional, IsUUID } from 'class-validator';

export class UpdateCalendarsDto {
  @ApiProperty({
    type: [String],
    description: 'Ids internos das agendas usadas para verificação de conflitos.',
  })
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  conflictCalendarIds!: string[];

  @ApiPropertyOptional({
    nullable: true,
    description: 'Id interno da agenda que receberá os novos eventos.',
  })
  @IsOptional()
  @IsUUID('4')
  destinationCalendarId?: string | null;
}
