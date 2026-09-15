import { registerDecorator, ValidationOptions } from 'class-validator';
import { isIanaTimezone } from '@agenda/shared';

/**
 * Valida que o valor é um identificador de timezone IANA real.
 *
 * Aceita tanto zonas com região ("America/Sao_Paulo") quanto as sem
 * ("UTC") — alguns navegadores reportam exatamente "UTC" em
 * `Intl.DateTimeFormat().resolvedOptions().timeZone`.
 *
 * Rejeita offsets fixos como "-03:00" ou "GMT-3": eles ignoram horário de
 * verão e quebrariam a disponibilidade duas vezes por ano (§26, §78).
 */
export function IsIanaTimezone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isIanaTimezone',
      target: object.constructor,
      propertyName,
      options: {
        message:
          'Timezone deve ser um identificador IANA válido (ex.: America/Sao_Paulo), não um offset fixo.',
        ...validationOptions,
      },
      validator: {
        validate(value: unknown) {
          return isIanaTimezone(value);
        },
      },
    });
  };
}
