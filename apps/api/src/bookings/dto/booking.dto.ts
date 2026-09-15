import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsIanaTimezone } from '../../common/validators/is-iana-timezone.validator';

export class AnswerDto {
  @ApiProperty()
  @IsUUID('4')
  questionId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  answer!: string;
}

export class UtmDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  medium?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  campaign?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  term?: string;
}

export class CreateBookingDto {
  @ApiProperty({
    example: '2026-09-25T09:00:00-03:00',
    description: 'Início do horário escolhido, em ISO-8601 com offset ou Z.',
  })
  @IsISO8601({ strict: true })
  start!: string;

  @ApiProperty({ example: 'America/Sao_Paulo', description: 'Timezone do convidado.' })
  @IsIanaTimezone()
  timezone!: string;

  @ApiProperty({ example: 'João Silva' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'joao@exemplo.com' })
  @IsEmail({}, { message: 'E-mail inválido.' })
  @Transform(({ value }) => String(value).trim().toLowerCase())
  email!: string;

  @ApiPropertyOptional({ example: '+55 82 99999-0000' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional({ type: [AnswerDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers?: AnswerDto[];

  @ApiPropertyOptional({
    description:
      'Chave de idempotência. A mesma chave no mesmo evento devolve a reserva já criada.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;

  @ApiPropertyOptional({ type: UtmDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UtmDto)
  utm?: UtmDto;
}

export class RescheduleBookingDto {
  @ApiProperty({ example: '2026-09-26T14:00:00-03:00' })
  @IsISO8601({ strict: true })
  start!: string;

  @ApiProperty({ example: 'America/Sao_Paulo' })
  @IsIanaTimezone()
  timezone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CancelBookingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
