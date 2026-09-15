export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Agrupa mensagens relacionadas; útil para provedores que suportam tags. */
  tag?: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

export const EMAIL_PROVIDER = 'EMAIL_PROVIDER';
