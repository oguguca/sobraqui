import "server-only";

import { Resend } from "resend";

type Email = { to: string; subject: string; text: string; html: string };

/**
 * Envia e-mail transacional via Resend. Sem RESEND_API_KEY, em desenvolvimento
 * mostra o conteúdo no terminal; em produção, falha sem expor o conteúdo.
 */
export async function sendEmail(email: Email): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`\n[email:dev] Para: ${email.to}\nAssunto: ${email.subject}\n${email.text}\n`);
      return;
    }
    console.error("[email] RESEND_API_KEY/EMAIL_FROM não configurados; e-mail não enviado.");
    throw new Error("Envio de e-mail não configurado.");
  }
  const { error } = await new Resend(apiKey).emails.send({ from, ...email });
  if (error) {
    console.error("[email] falha no envio:", error.name);
    throw new Error("Falha ao enviar e-mail.");
  }
}
