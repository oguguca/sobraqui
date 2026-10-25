"use server";

import { z } from "zod";

import { optionalText, timezone } from "@/lib/validation";
import { affected, authedAction } from "@/server/action";

export const updateProfile = authedAction(
  z.object({ displayName: optionalText(80), timezone }),
  async (input, { db, user }) =>
    affected(
      await db((tx) =>
        tx.profile.updateMany({
          where: { id: user.id },
          data: { display_name: input.displayName, timezone: input.timezone },
        }),
      ),
      "Perfil",
    ),
  { message: "Preferências salvas." },
);
