-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "CalendarProvider" AS ENUM ('GOOGLE');

-- CreateEnum
CREATE TYPE "CalendarConnectionStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'REAUTH_REQUIRED');

-- CreateEnum
CREATE TYPE "AvailabilityOverrideType" AS ENUM ('UNAVAILABLE', 'CUSTOM_HOURS');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('GOOGLE_MEET', 'PHYSICAL', 'CUSTOM_LINK', 'PHONE', 'NONE');

-- CreateEnum
CREATE TYPE "EventKind" AS ENUM ('ONE_TO_ONE', 'GROUP', 'COLLECTIVE', 'ROUND_ROBIN');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('TEXT', 'TEXTAREA', 'SELECT', 'RADIO', 'CHECKBOX');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'RESCHEDULED', 'FAILED');

-- CreateEnum
CREATE TYPE "BookingHistoryAction" AS ENUM ('CREATED', 'CONFIRMED', 'RESCHEDULED', 'CANCELLED', 'FAILED');

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "username" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "locale" TEXT NOT NULL DEFAULT 'pt-BR',
    "onboardingStep" INTEGER NOT NULL DEFAULT 0,
    "onboardingDone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_connections" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" "CalendarProvider" NOT NULL DEFAULT 'GOOGLE',
    "providerAccountId" TEXT NOT NULL,
    "accountEmail" TEXT,
    "encryptedAccessToken" TEXT,
    "encryptedRefreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMPTZ(6),
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "CalendarConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "lastSyncedAt" TIMESTAMPTZ(6),
    "syncChannelId" TEXT,
    "syncChannelExpiresAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "calendar_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connected_calendars" (
    "id" UUID NOT NULL,
    "calendarConnectionId" UUID NOT NULL,
    "providerCalendarId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "checkConflicts" BOOLEAN NOT NULL DEFAULT false,
    "isBookingDestination" BOOLEAN NOT NULL DEFAULT false,
    "accessRole" TEXT,
    "timezone" TEXT,
    "syncToken" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "connected_calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_schedules" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "availability_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_rules" (
    "id" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_overrides" (
    "id" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "type" "AvailabilityOverrideType" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_override_intervals" (
    "id" UUID NOT NULL,
    "overrideId" UUID NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,

    CONSTRAINT "availability_override_intervals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_types" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "hostUserId" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "kind" "EventKind" NOT NULL DEFAULT 'ONE_TO_ONE',
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "slotIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
    "locationType" "LocationType" NOT NULL DEFAULT 'GOOGLE_MEET',
    "locationValue" TEXT,
    "bufferBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
    "bufferAfterMinutes" INTEGER NOT NULL DEFAULT 0,
    "minimumNoticeMinutes" INTEGER NOT NULL DEFAULT 120,
    "bookingWindowDays" INTEGER NOT NULL DEFAULT 30,
    "maxBookingsPerDay" INTEGER,
    "minimumCancellationNoticeMinutes" INTEGER NOT NULL DEFAULT 0,
    "minimumRescheduleNoticeMinutes" INTEGER NOT NULL DEFAULT 0,
    "timezone" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "event_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_questions" (
    "id" UUID NOT NULL,
    "eventTypeId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL DEFAULT 'TEXT',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "eventTypeId" UUID NOT NULL,
    "hostUserId" UUID NOT NULL,
    "inviteeName" TEXT NOT NULL,
    "inviteeEmail" TEXT NOT NULL,
    "inviteePhone" TEXT,
    "inviteeTimezone" TEXT NOT NULL,
    "eventNameSnapshot" TEXT NOT NULL,
    "eventDurationSnapshot" INTEGER NOT NULL,
    "locationTypeSnapshot" "LocationType" NOT NULL,
    "locationValueSnapshot" TEXT,
    "startAt" TIMESTAMPTZ(6) NOT NULL,
    "endAt" TIMESTAMPTZ(6) NOT NULL,
    "blockedStartAt" TIMESTAMPTZ(6) NOT NULL,
    "blockedEndAt" TIMESTAMPTZ(6) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "googleCalendarId" TEXT,
    "googleEventId" TEXT,
    "googleMeetUrl" TEXT,
    "syncError" TEXT,
    "idempotencyKey" TEXT,
    "cancelTokenHash" TEXT NOT NULL,
    "rescheduleTokenHash" TEXT NOT NULL,
    "cancellationReason" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "cancelledAt" TIMESTAMPTZ(6),
    "rescheduledAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_answers" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "questionId" UUID,
    "questionLabelSnapshot" TEXT NOT NULL,
    "answer" TEXT NOT NULL,

    CONSTRAINT "booking_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_history" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "action" "BookingHistoryAction" NOT NULL,
    "oldStartAt" TIMESTAMPTZ(6),
    "oldEndAt" TIMESTAMPTZ(6),
    "newStartAt" TIMESTAMPTZ(6),
    "newEndAt" TIMESTAMPTZ(6),
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "workspaceId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workspace_members_userId_idx" ON "workspace_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_workspaceId_userId_key" ON "workspace_members"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_workspaceId_idx" ON "users"("workspaceId");

-- CreateIndex
CREATE INDEX "calendar_connections_userId_idx" ON "calendar_connections"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_connections_userId_provider_providerAccountId_key" ON "calendar_connections"("userId", "provider", "providerAccountId");

-- CreateIndex
CREATE INDEX "connected_calendars_calendarConnectionId_idx" ON "connected_calendars"("calendarConnectionId");

-- CreateIndex
CREATE UNIQUE INDEX "connected_calendars_calendarConnectionId_providerCalendarId_key" ON "connected_calendars"("calendarConnectionId", "providerCalendarId");

-- CreateIndex
CREATE INDEX "availability_schedules_userId_idx" ON "availability_schedules"("userId");

-- CreateIndex
CREATE INDEX "availability_rules_scheduleId_idx" ON "availability_rules"("scheduleId");

-- CreateIndex
CREATE INDEX "availability_rules_scheduleId_weekday_idx" ON "availability_rules"("scheduleId", "weekday");

-- CreateIndex
CREATE INDEX "availability_overrides_scheduleId_idx" ON "availability_overrides"("scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "availability_overrides_scheduleId_date_key" ON "availability_overrides"("scheduleId", "date");

-- CreateIndex
CREATE INDEX "availability_override_intervals_overrideId_idx" ON "availability_override_intervals"("overrideId");

-- CreateIndex
CREATE INDEX "event_types_hostUserId_idx" ON "event_types"("hostUserId");

-- CreateIndex
CREATE INDEX "event_types_workspaceId_idx" ON "event_types"("workspaceId");

-- CreateIndex
CREATE INDEX "event_types_slug_idx" ON "event_types"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "event_types_hostUserId_slug_key" ON "event_types"("hostUserId", "slug");

-- CreateIndex
CREATE INDEX "event_questions_eventTypeId_idx" ON "event_questions"("eventTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_cancelTokenHash_key" ON "bookings"("cancelTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_rescheduleTokenHash_key" ON "bookings"("rescheduleTokenHash");

-- CreateIndex
CREATE INDEX "bookings_hostUserId_idx" ON "bookings"("hostUserId");

-- CreateIndex
CREATE INDEX "bookings_startAt_idx" ON "bookings"("startAt");

-- CreateIndex
CREATE INDEX "bookings_status_idx" ON "bookings"("status");

-- CreateIndex
CREATE INDEX "bookings_eventTypeId_idx" ON "bookings"("eventTypeId");

-- CreateIndex
CREATE INDEX "bookings_hostUserId_status_startAt_idx" ON "bookings"("hostUserId", "status", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_eventTypeId_idempotencyKey_key" ON "bookings"("eventTypeId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "booking_answers_bookingId_idx" ON "booking_answers"("bookingId");

-- CreateIndex
CREATE INDEX "booking_history_bookingId_idx" ON "booking_history"("bookingId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connected_calendars" ADD CONSTRAINT "connected_calendars_calendarConnectionId_fkey" FOREIGN KEY ("calendarConnectionId") REFERENCES "calendar_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_schedules" ADD CONSTRAINT "availability_schedules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "availability_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_overrides" ADD CONSTRAINT "availability_overrides_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "availability_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_override_intervals" ADD CONSTRAINT "availability_override_intervals_overrideId_fkey" FOREIGN KEY ("overrideId") REFERENCES "availability_overrides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_types" ADD CONSTRAINT "event_types_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_types" ADD CONSTRAINT "event_types_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_types" ADD CONSTRAINT "event_types_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "availability_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_questions" ADD CONSTRAINT "event_questions_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "event_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "event_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_answers" ADD CONSTRAINT "booking_answers_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_answers" ADD CONSTRAINT "booking_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "event_questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_history" ADD CONSTRAINT "booking_history_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
