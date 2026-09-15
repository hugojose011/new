import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateProfileDto } from '../auth/dto/auth.dto';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';

export class OnboardingStepDto {
  @ApiProperty({ minimum: 0, maximum: 4 })
  @IsInt()
  @Min(0)
  @Max(4)
  step!: number;
}

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Perfil do usuário autenticado.' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getProfile(user.id);
  }

  @Put('me')
  @ApiOperation({ summary: 'Atualiza perfil, username e timezone.' })
  update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.service.updateProfile(user.id, dto);
  }

  @Get('username-available')
  @ApiOperation({ summary: 'Verifica se um username está livre.' })
  async available(@CurrentUser() user: AuthenticatedUser, @Query('username') username: string) {
    return { available: await this.service.isUsernameAvailable((username ?? '').toLowerCase(), user.id) };
  }

  @Post('onboarding')
  @ApiOperation({ summary: 'Marca a etapa concluída do onboarding.' })
  onboarding(@CurrentUser() user: AuthenticatedUser, @Body() dto: OnboardingStepDto) {
    return this.service.completeOnboardingStep(user.id, dto.step);
  }
}
