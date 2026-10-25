import { normalizeText } from "./text";

// Regras por estabelecimento/descrição -> nome de categoria padrão.
// Mais precisas que a categoria genérica do banco; a escolha do usuário (histórico) vem antes de tudo.
const RULES: { pattern: RegExp; category: string }[] = [
  // Encargos do cartão/conta: não são consumo, mas custam dinheiro.
  { pattern: /\b(iof|juros|multa|encargo|tarifa|anuidade)\b|rotativo|saldo (anterior|em atraso)|saldo nao pago/, category: "Juros e tarifas" },
  { pattern: /\b(ifood|keeta|rappi|99food|ze delivery|aiqfome)\b|restaurante|lanchonete|padaria|pizzaria|burger|mcdonald|bk\b|outback|cafe\b|cafeteria/, category: "Alimentação" },
  { pattern: /\b(supermercado|mercado|atacadao|assai|carrefour|pao de acucar|extra hiper|hortifruti|sacolao)\b/, category: "Alimentação" },
  { pattern: /\b(uber|99app|99 pop|cabify|indriver|blablacar)\b|\b99\*|posto|combustivel|shell|ipiranga|petrobras|estacionamento|sem parar|veloe|conectcar|metro|bilhete unico/, category: "Transporte" },
  { pattern: /\b(spotify|netflix|disney|hbo|max\.com|prime video|amazon prime|youtube|deezer|apple\.com|icloud|google one|chatgpt|openai|claude|globoplay|paramount|crunchyroll)\b/, category: "Assinaturas" },
  { pattern: /\b(vivo|claro|tim|oi)\b (movel|fibra|celular|recarga)|recarga (efetuada|de celular)/, category: "Assinaturas" },
  { pattern: /\b(drogasil|droga raia|raia|pague menos|panvel|drogaria|farmacia|ultrafarma)\b|hospital|clinica|laboratorio|dentista|unimed|amil|hapvida/, category: "Saúde" },
  { pattern: /smart ?fit|bluefit|academia|gympass|wellhub|totalpass/, category: "Saúde" },
  { pattern: /\b(shopee|mercadolivre|mercado livre|mlp\*|meli|amazon|aliexpress|shein|netshoes|enjoei|magalu|magazine luiza|americanas|kabum|centauro|renner|riachuelo|c&a|zara|temu)\b/, category: "Compras" },
  { pattern: /\b(cinema|cinemark|ingresso|sympla|eventim|steam|playstation|xbox|nintendo|bet|apostas?)\b/, category: "Lazer" },
  { pattern: /\b(faculdade|universidade|escola|curso|udemy|alura|coursera)\b/, category: "Educação" },
  { pattern: /\b(aluguel|condominio|enel|light|cemig|copel|sabesp|energia|agua e esgoto|gas natural|comgas)\b/, category: "Moradia" },
];

/** Pix/TED para uma pessoa (nome próprio, sem cara de empresa). */
const PERSON_TRANSFER = /^(transferencia enviada|pix enviado)/;
const COMPANY_HINT = /\b(ltda|s\.?a\.?|me|eireli|comercial|servicos|produtos|pagamentos|tecnologia|com\b|brasil)\b|\*/;

export function categoryFromDescription(description: string): string | null {
  const d = normalizeText(description);
  for (const rule of RULES) if (rule.pattern.test(d)) return rule.category;
  if (PERSON_TRANSFER.test(d) && !COMPANY_HINT.test(d)) return "Pix para pessoas";
  return null;
}
