-- Novas categorias padrão para quem já tem conta (novos usuários recebem no cadastro).
INSERT INTO "categories" (id, user_id, name, kind, icon, color, created_at, updated_at)
SELECT gen_random_uuid(), u.id, v.name, 'expense', v.icon, v.color, now(), now()
FROM "users" u
CROSS JOIN (VALUES ('Juros e tarifas', 'receipt', '#a16207'), ('Pix para pessoas', 'hand-coins', '#0f766e')) AS v(name, icon, color)
WHERE NOT EXISTS (
  SELECT 1 FROM "categories" c WHERE c.user_id = u.id AND c.kind = 'expense' AND lower(c.name) = lower(v.name)
);
