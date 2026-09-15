import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { IsIanaTimezone } from '../../common/validators/is-iana-timezone.validator';

export class RegisterDto {
  @ApiProperty({ example: 'Diogo Andrade' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'diogo@exemplo.com' })
  @IsEmail({}, { message: 'E-mail inválido.' })
  @Transform(({ value }) => String(value).trim().toLowerCase())
  email!: string;

  @ApiProperty({ minLength: 8, example: 'uma-senha-forte' })
  @IsString()
  @MinLength(8, { message: 'A senha deve ter ao menos 8 caracteres.' })
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({ example: 'America/Sao_Paulo' })
  @IsOptional()
  @IsIanaTimezone()
  timezone?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'diogo@exemplo.com' })
  @IsEmail()
  @Transform(({ value }) => String(value).trim().toLowerCase())
  email!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  password!: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'diogo', description: 'Username único; define o link público.' })
  @IsOptional()
  @Transform(({ value }) => String(value).trim().toLowerCase())
  @Matches(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/, {
    message: 'Username deve ter 3 a 40 caracteres: letras minúsculas, números e hífen.',
  })
  username?: string;

  @ApiPropertyOptional({ example: 'America/Sao_Paulo' })
  @IsOptional()
  @IsIanaTimezone()
  timezone?: string;

  @ApiPropertyOptional({ example: 'pt-BR' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  locale?: string;
}
