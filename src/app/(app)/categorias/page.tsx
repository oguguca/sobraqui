import { redirect } from "next/navigation";

// Categorias agora ficam em Configurações; mantém links antigos funcionando.
export default function CategoriesPage() {
  redirect("/configuracoes#categorias");
}
