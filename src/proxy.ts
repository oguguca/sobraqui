import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/sobre", "/login", "/cadastro", "/recuperar-senha", "/redefinir-senha", "/api/auth"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Só redireciona quem não tem cookie de sessão. A sessão é validada de verdade
// no servidor (src/server/auth.ts) e os dados são protegidos pelo RLS.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  if (!getSessionCookie(request)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    // Quem chega sem sessão na raiz vê a apresentação do Sobraqui no mesmo endereço.
    if (pathname === "/") {
      url.pathname = "/sobre";
      return NextResponse.rewrite(url);
    }
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
