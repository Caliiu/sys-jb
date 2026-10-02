import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AdminAuthController } from './admin/admin-auth.controller.js';
import { AdminUsersController } from './admin/admin-users.controller.js';
import { AuditController } from './admin/audit.controller.js';
import { AuditService } from './admin/audit.service.js';
import { CommissionsController } from './admin/commissions.controller.js';
import { CommissionsService } from './admin/commissions.service.js';
import { QuotesAdminController } from './admin/quotes-admin.controller.js';
import { DrawsAdminController } from './admin/draws-admin.controller.js';
import { MuralsAdminController } from './admin/murals-admin.controller.js';
import { BrandingAdminController } from './admin/branding-admin.controller.js';
import { TicketsAdminController } from './admin/tickets-admin.controller.js';
import { TicketsAdminService } from './admin/tickets-admin.service.js';
import { PrizesAdminController } from './admin/prizes-admin.controller.js';
import { OperationSummaryController } from './admin/operation-summary.controller.js';
import { OperationSummaryService } from './admin/operation-summary.service.js';
import { GeneralReportController } from './admin/general-report.controller.js';
import { GeneralReportService } from './admin/general-report.service.js';
import { SalesByDrawController } from './admin/sales-by-draw.controller.js';
import { SalesByDrawService } from './admin/sales-by-draw.service.js';
import { CasinoGeneralController } from './admin/casino-general.controller.js';
import { CasinoGeneralService } from './admin/casino-general.service.js';
import { CasinoClosingController } from './admin/casino-closing.controller.js';
import { CasinoClosingService } from './admin/casino-closing.service.js';
import { PlayerStatementController } from './admin/player-statement.controller.js';
import { PlayerStatementService } from './admin/player-statement.service.js';
import { PrizesAdminService } from './admin/prizes-admin.service.js';
import { BrandingService } from './branding/branding.service.js';
import { HomeLayoutService } from './branding/home-layout.service.js';
import { MuralsController } from './murals/murals.controller.js';
import { MuralsService } from './murals/murals.service.js';
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
import { RateLimitInterceptor } from './rate-limit/rate-limit.interceptor.js';
import { RateLimitService } from './rate-limit/rate-limit.service.js';
import { ResultsController, ResultsWebhookController } from './results/results.controller.js';
import { ResultsService } from './results/results.service.js';
import { HoroscopeController } from './horoscope/horoscope.controller.js';
import { HoroscopeService } from './horoscope/horoscope.service.js';
import { OverdueService } from './overdue/overdue.service.js';
import { PushController } from './push/push.controller.js';
import { PushService } from './push/push.service.js';
import { ResultNotifier } from './push/result-notifier.js';
import { ResultsWebhookGuard } from './results/results-webhook.guard.js';
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
        MuralsAdminController,
        BrandingAdminController,
        TicketsAdminController,
        PrizesAdminController,
        OperationSummaryController,
        GeneralReportController,
        SalesByDrawController,
        CasinoGeneralController,
        CasinoClosingController,
        PlayerStatementController,
        MuralsController,
        DrawsController,
        QuotesController,
        PrizesController,
        ReportsController,
        PulesController,
        LotteriesController,
        ProfileController,
        FazendinhaController,
        ResultsController,
        ResultsWebhookController,
        HoroscopeController,
        PushController,
      ],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: APP_INTERCEPTOR, useClass: RateLimitInterceptor },
        RateLimitService,
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
        TicketsAdminService,
        PrizesAdminService,
        OperationSummaryService,
        GeneralReportService,
        SalesByDrawService,
        CasinoGeneralService,
        CasinoClosingService,
        PlayerStatementService,
        QuotesService,
        PrizesService,
        ReportsService,
        DrawsService,
        MuralsService,
        BrandingService,
        HomeLayoutService,
        LotteriesService,
        SessionGuard,
        ProfileService,
        FazendinhaService,
        ResultsService,
        ResultsWebhookGuard,
        HoroscopeService,
        OverdueService,
        PushService,
        ResultNotifier,
      ],
    };
  }
}
