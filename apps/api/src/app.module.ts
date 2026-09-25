import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AuthController } from './auth/auth.controller.js';
import { AuthService } from './auth/auth.service.js';
import { PasswordService } from './auth/password.service.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { APP_CONFIG, type AppConfig } from './config/config.js';
import { DatabaseService } from './database/database.service.js';
import { HealthController } from './health/health.controller.js';
import { TenantController } from './tenancy/tenant.controller.js';
import { TenantGuard } from './tenancy/tenant.guard.js';
import { TenantResolverService } from './tenancy/tenant-resolver.service.js';
import { UsersController } from './users/users.controller.js';
import { UsersRepository, WalletsRepository } from './users/users.repository.js';
import { UsersService } from './users/users.service.js';

/** Monólito modular: tenancy, users/wallet e health compartilham a mesma conexão de runtime. */
@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, TenantController, UsersController, AuthController],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        DatabaseService,
        TenantResolverService,
        TenantGuard,
        UsersRepository,
        WalletsRepository,
        UsersService,
        PasswordService,
        AuthService,
      ],
    };
  }
}
