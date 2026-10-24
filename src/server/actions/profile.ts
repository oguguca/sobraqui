"use server";

import { z } from "zod";

import { optionalText, timezone } from "@/lib/validation";
import { authedAction, check, found } from "@/server/action";

export const updateProfile = authedAction(
  z.object({ displayName: optionalText(80), timezone }),
  async (input, { supabase, user }) => {
    const { data, error } = await supabase
      .from("profiles")
      .update({ display_name: input.displayName, timezone: input.timezone })
      .eq("id", user.id)
      .select("id")
      .maybeSingle();
    check(error, "salvar as preferências");
    return found(data, "Perfil");
  },
  { message: "Preferências salvas." },
);
