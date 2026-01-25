import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthServiceService } from './auth-service.service';
import { RegisterLearnerDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('Authentication')
@Controller('auth')
export class AuthServiceController {
  constructor(private readonly authService: AuthServiceService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new learner account' })
  @ApiResponse({
    status: 201,
    description: 'Account successfully created',
  })
  @ApiResponse({
    status: 409,
    description: 'Email already registered',
  })
  async register(@Body() registerDto: RegisterLearnerDto) {
    return this.authService.registerLearner(registerDto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login to get access token' })
  @ApiResponse({
    status: 200,
    description: 'Successfully logged in',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials',
  })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getProfile(@Request() req) {
    return this.authService.getProfile(req.user.sub);
  }
}
