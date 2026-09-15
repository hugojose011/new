import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsIanaTimezone } from '../../common/validators/is-iana-timezone.validator';

export class RuleDto {
  @ApiProperty({ minimum: 0, maximum: 6, description: '0 = domingo ... 6 = sábado' })
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @ApiProperty({ example: 540, description: 'Minutos desde a meia-noite local (09:00 = 540).' })
  @IsInt()
  @Min(0)
  @Max(1440)
  startMinute!: number;

  @ApiProperty({ example: 1080 })
  @IsInt()
  @Min(0)
  @Max(1440)
  endMinute!: number;
}

export class OverrideIntervalDto {
  @ApiProperty()
  @IsInt()
  @Min(0)
  @Max(1440)
  startMinute!: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  @Max(1440)
  endMinute!: number;
}

export class OverrideDto {
  @ApiProperty({ example: '2026-09-21' })
  @IsISO8601({ strict: true })
  date!: string;

  @ApiProperty({ enum: ['UNAVAILABLE', 'CUSTOM_HOURS'] })
  @IsEnum(['UNAVAILABLE', 'CUSTOM_HOURS'])
  type!: 'UNAVAILABLE' | 'CUSTOM_HOURS';

  @ApiProperty({ type: [OverrideIntervalDto] })
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => OverrideIntervalDto)
  intervals!: OverrideIntervalDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class CreateScheduleDto {
  @ApiProperty({ example: 'Horário comercial' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiProperty({ example: 'America/Sao_Paulo' })
  @IsIanaTimezone()
  timezone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ type: [RuleDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(70)
  @ValidateNested({ each: true })
  @Type(() => RuleDto)
  rules?: RuleDto[];

  @ApiPropertyOptional({ type: [OverrideDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(365)
  @ValidateNested({ each: true })
  @Type(() => OverrideDto)
  overrides?: OverrideDto[];
}

export class UpdateScheduleDto extends CreateScheduleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  declare name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIanaTimezone()
  declare timezone: string;
}
