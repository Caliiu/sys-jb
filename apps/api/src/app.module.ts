import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AdminAuthController } from './admin/admin-auth.controller.js';
import { AdminUsersController } from './admin/admin-users.controller.js';
import { AuditController } from './admin/audit.controller.js';
import { AuditService } from './admin/audit.service.js';
import { CommissionsController } from './admin/commissions.controller.js';
import { CommissionsService } from './admin/commissions.service.js';
import { QuotesAdminController } from './admin/quotes-admin.controller.js';
import { DrawsAdminController } from './admin/draws-admin.controller.js';
import { DrawsController } from './draws/draws.controller.js';
import { DrawsService } from './draws/draws.service.js';
import { LotteriesController } from './lotteries/lotteries.controller.js';
import { LotteriesService } from './lotteries/lotteries.service.js';
import { PrizesController } from './prizes/prizes.controller.js';
import { PrizesService } from './prizes/prizes.service.js';
import { QuotesController } from './quotes/quotes.controller.js';
import { PulesController, ReportsController } from './reports/reports.controller.js';
import { ReportsService } from './reports/reports.service.js';
import { QuotesService } from './quotes/quotes.service.js';
import { PromotersController } from './admin/promoters.controller.js';
import { PromotersRepository } from './admin/promoters.repository.js';
import { PromotersService } from './admin/promoters.service.js';
import { AdminUsersRepository } from './admin/admin-users.repository.js';
import { AdminUsersService } from './admin/admin-users.service.js';
import { ConsoleGuard } from './admin/console.guard.js';
import { OperatorAuthService } from './admin/operator-auth.service.js';
import { OperatorGuard } from './admin/operator.guard.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthService } from './auth/auth.service.js';
import { LoginThrottleService } from './auth/login-throttle.service.js';
import { PasswordService } from './auth/password.service.js';
import { SessionGuard } from './auth/session.guard.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { APP_CONFIG, type AppConfig } from './config/config.js';
import { DatabaseService } from './database/database.service.js';
import { FazendinhaController } from './fazendinha/fazendinha.controller.js';
import { FazendinhaService } from './fazendinha/fazendinha.service.js';
import { HealthController } from './health/health.controller.js';
import { TenantController } from './tenancy/tenant.controller.js';
import { TenantGuard } from './tenancy/tenant.guard.js';
import { TenantResolverService } from './tenancy/tenant-resolver.service.js';
import { ProfileController } from './users/profile.controller.js';
import { ProfileService } from './users/profile.service.js';
import { UsersController } from './users/users.controller.js';
import { UsersRepository, WalletsRepository } from './users/users.repository.js';
import { UsersService } from './users/users.service.js';

/** Monólito modular: tenancy, users/wallet, fazendinha, painel administrativo e health compartilham a mesma conexão de runtime. */
@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      controllers: [
        HealthController,
        TenantController,
        UsersController,
        AuthController,
        AdminAuthController,
        AdminUsersController,
        PromotersController,
        AuditController,
        CommissionsController,
        QuotesAdminController,
        DrawsAdminController,
        DrawsController,
        QuotesController,
        PrizesController,
        ReportsController,
        PulesController,
        LotteriesController,
        ProfileController,
        FazendinhaController,
      ],
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
        LoginThrottleService,
        AuthService,
        OperatorAuthService,
        ConsoleGuard,
        OperatorGuard,
        AdminUsersRepository,
        AdminUsersService,
        PromotersRepository,
        PromotersService,
        AuditService,
        CommissionsService,
        QuotesService,
        PrizesService,
        ReportsService,
        DrawsService,
        LotteriesService,
        SessionGuard,
        ProfileService,
        FazendinhaService,
      ],
    };
  }
}
