import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { EVENT_KIND, LOCATION_TYPE, QUESTION_TYPE } from '@agenda/shared';
import { IsIanaTimezone } from '../../common/validators/is-iana-timezone.validator';

export class QuestionDto {
  @ApiProperty({ example: 'Qual é o nome da sua empresa?' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  label!: string;

  @ApiProperty({ enum: QUESTION_TYPE })
  @IsEnum(QUESTION_TYPE)
  type!: (typeof QUESTION_TYPE)[number];

  @ApiProperty()
  @IsBoolean()
  required!: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  options?: string[];

  @ApiProperty()
  @IsInt()
  @Min(0)
  @Max(100)
  order!: number;
}

export class CreateEventTypeDto {
  @ApiProperty({ example: 'Reunião de Demonstração' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'demonstracao' })
  @IsOptional()
  @Transform(({ value }) => String(value).trim().toLowerCase())
  @Matches(/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/, {
    message: 'Slug deve conter apenas letras minúsculas, números e hífen.',
  })
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: 'Agenda de disponibilidade usada por este evento.' })
  @IsOptional()
  @IsUUID('4')
  scheduleId?: string;

  @ApiProperty({ example: 30 })
  @IsInt()
  @Min(5)
  @Max(1440)
  durationMinutes!: number;

  @ApiPropertyOptional({ example: 30, description: 'De quanto em quanto tempo os horários começam.' })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  slotIntervalMinutes?: number;

  @ApiProperty({ enum: LOCATION_TYPE })
  @IsEnum(LOCATION_TYPE)
  locationType!: (typeof LOCATION_TYPE)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  locationValue?: string | null;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(720)
  bufferBeforeMinutes?: number;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(720)
  bufferAfterMinutes?: number;

  @ApiPropertyOptional({ example: 120 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60 * 24 * 30)
  minimumNoticeMinutes?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  bookingWindowDays?: number;

  @ApiPropertyOptional({ nullable: true, example: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxBookingsPerDay?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60 * 24 * 30)
  minimumCancellationNoticeMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60 * 24 * 30)
  minimumRescheduleNoticeMinutes?: number;

  @ApiPropertyOptional({ example: 'America/Sao_Paulo' })
  @IsOptional()
  @IsIanaTimezone()
  timezone?: string;

  @ApiPropertyOptional({ enum: EVENT_KIND, default: 'ONE_TO_ONE' })
  @IsOptional()
  @IsEnum(EVENT_KIND)
  kind?: (typeof EVENT_KIND)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: [QuestionDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => QuestionDto)
  questions?: QuestionDto[];
}

export class UpdateEventTypeDto extends PartialType(CreateEventTypeDto) {}
