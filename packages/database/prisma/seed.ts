/**
 * Seed de desenvolvimento.
 *
 * Cria um workspace com um host demonstrativo, uma agenda de disponibilidade
 * de segunda a sexta (09h-18h) e um EventType de 30 minutos.
 *
 * Nenhum token Google é persistido: a conexão real precisa ser feita pelo
 * fluxo OAuth da aplicação.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const DEMO_EMAIL = process.env.SEED_EMAIL ?? 'demo@agenda.local';
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'demo12345';
const DEMO_USERNAME = process.env.SEED_USERNAME ?? 'demo';
const TIMEZONE = process.env.SEED_TIMEZONE ?? 'America/Sao_Paulo';

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) {
    console.log(`Seed: usuário ${DEMO_EMAIL} já existe, nada a fazer.`);
    return;
  }

  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });

  const workspace = await prisma.workspace.create({ data: { name: 'Workspace Demo' } });

  const user = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      name: 'Host Demonstração',
      email: DEMO_EMAIL,
      passwordHash,
      username: DEMO_USERNAME,
      timezone: TIMEZONE,
      locale: 'pt-BR',
      onboardingDone: true,
      onboardingStep: 4,
      memberships: { create: { workspaceId: workspace.id, role: 'OWNER' } },
    },
  });

  const schedule = await prisma.availabilitySchedule.create({
    data: {
      userId: user.id,
      name: 'Horário comercial',
      timezone: TIMEZONE,
      isDefault: true,
      rules: {
        create: [1, 2, 3, 4, 5].map((weekday) => ({
          weekday,
          startMinute: 9 * 60,
          endMinute: 18 * 60,
        })),
      },
    },
  });

  await prisma.eventType.create({
    data: {
      workspaceId: workspace.id,
      hostUserId: user.id,
      scheduleId: schedule.id,
      name: 'Reunião de Demonstração',
      slug: 'demonstracao',
      description: 'Conversa rápida para apresentar a plataforma.',
      durationMinutes: 30,
      slotIntervalMinutes: 30,
      locationType: 'GOOGLE_MEET',
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 15,
      minimumNoticeMinutes: 120,
      bookingWindowDays: 30,
      timezone: TIMEZONE,
      questions: {
        create: [
          {
            label: 'Qual é o nome da sua empresa?',
            type: 'TEXT',
            required: false,
            order: 0,
          },
          {
            label: 'Existe algo que devemos saber antes da reunião?',
            type: 'TEXTAREA',
            required: false,
            order: 1,
          },
        ],
      },
    },
  });

  console.log('Seed concluído.');
  console.log(`  E-mail: ${DEMO_EMAIL}`);
  console.log(`  Senha:  ${DEMO_PASSWORD}`);
  console.log(`  Link público: /${DEMO_USERNAME}/demonstracao`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
