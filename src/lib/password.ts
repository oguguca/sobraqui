/** Política de senha: 10 a 72 caracteres, com maiúscula, minúscula e número. */
export function passwordProblem(password: string): string | null {
  if (password.length < 10) return "Use pelo menos 10 caracteres.";
  if (password.length > 72) return "Use até 72 caracteres.";
  if (!/[a-z]/.test(password)) return "Inclua uma letra minúscula.";
  if (!/[A-Z]/.test(password)) return "Inclua uma letra maiúscula.";
  if (!/\d/.test(password)) return "Inclua um número.";
  return null;
}
