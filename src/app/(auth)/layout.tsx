import Link from "next/link";

import { Brand } from "@/components/brand";
import { BrandAurora } from "@/components/motion/brand-aurora";
import { Reveal } from "@/components/motion/reveal";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="relative isolate flex min-h-svh flex-col items-center justify-center overflow-hidden px-4 py-12">
      <BrandAurora className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[60svh] opacity-40 [mask-image:linear-gradient(to_bottom,#000_40%,transparent)]" />
      <Reveal trigger="mount" distance={20} className="w-full max-w-sm">
        <Link href="/sobre" aria-label="Conhecer o Sobraqui" className="mb-8 flex justify-center">
          <Brand size="lg" />
        </Link>
        {children}
      </Reveal>
    </main>
  );
}
