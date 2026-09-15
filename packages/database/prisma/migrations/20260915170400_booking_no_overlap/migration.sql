-- ---------------------------------------------------------------------------
-- Proteção definitiva contra double booking.
--
-- O Prisma não modela constraints de exclusão, então ela é criada aqui em SQL.
-- A regra: para um mesmo host, dois bookings em estado "bloqueante"
-- (PENDING ou CONFIRMED) não podem ter intervalos bloqueados sobrepostos.
--
-- O intervalo considerado é [blocked_start_at, blocked_end_at), que já inclui
-- os buffers antes/depois configurados no EventType. O limite superior é
-- exclusivo, então uma reunião que termina 15:00 não conflita com outra que
-- começa 15:00.
--
-- Bookings CANCELLED / RESCHEDULED / FAILED ficam fora do índice parcial e
-- portanto liberam o horário automaticamente.
--
-- Requer btree_gist para permitir a comparação de igualdade em "hostUserId"
-- (uuid) dentro de um índice GiST.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist (
    "hostUserId" WITH =,
    tstzrange("blockedStartAt", "blockedEndAt", '[)') WITH &&
  )
  WHERE (status IN ('PENDING', 'CONFIRMED'));

-- Garantias de integridade adicionais que o Prisma também não expressa.
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_valid_range" CHECK ("startAt" < "endAt"),
  ADD CONSTRAINT "bookings_valid_blocked_range" CHECK ("blockedStartAt" < "blockedEndAt"),
  ADD CONSTRAINT "bookings_blocked_contains_meeting"
    CHECK ("blockedStartAt" <= "startAt" AND "blockedEndAt" >= "endAt");

ALTER TABLE "availability_rules"
  ADD CONSTRAINT "availability_rules_valid_window"
    CHECK ("startMinute" >= 0 AND "endMinute" <= 1440 AND "startMinute" < "endMinute"),
  ADD CONSTRAINT "availability_rules_valid_weekday"
    CHECK (weekday BETWEEN 0 AND 6);

ALTER TABLE "availability_override_intervals"
  ADD CONSTRAINT "availability_override_intervals_valid_window"
    CHECK ("startMinute" >= 0 AND "endMinute" <= 1440 AND "startMinute" < "endMinute");

ALTER TABLE "event_types"
  ADD CONSTRAINT "event_types_valid_numbers" CHECK (
    "durationMinutes" > 0
    AND "slotIntervalMinutes" > 0
    AND "bufferBeforeMinutes" >= 0
    AND "bufferAfterMinutes" >= 0
    AND "minimumNoticeMinutes" >= 0
    AND "bookingWindowDays" > 0
    AND ("maxBookingsPerDay" IS NULL OR "maxBookingsPerDay" > 0)
  );

-- Apenas uma agenda de destino por conexão.
CREATE UNIQUE INDEX "connected_calendars_single_destination"
  ON "connected_calendars" ("calendarConnectionId")
  WHERE "isBookingDestination" = true;

-- Apenas um schedule padrão por usuário.
CREATE UNIQUE INDEX "availability_schedules_single_default"
  ON "availability_schedules" ("userId")
  WHERE "isDefault" = true;
