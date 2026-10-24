"use client";

import { useState } from "react";

import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useServerAction } from "@/hooks/use-server-action";
import { updateProfile } from "@/server/actions/profile";

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Bahia",
  "America/Fortaleza",
  "America/Recife",
  "America/Belem",
  "America/Manaus",
  "America/Cuiaba",
  "America/Campo_Grande",
  "America/Porto_Velho",
  "America/Boa_Vista",
  "America/Rio_Branco",
  "America/Noronha",
  "UTC",
];

export function ProfileForm({ displayName, timezone }: { displayName: string | null; timezone: string }) {
  const [name, setName] = useState(displayName ?? "");
  const [tz, setTz] = useState(timezone);
  const { run, pending, fieldErrors } = useServerAction(updateProfile);
  const zones = TIMEZONES.includes(tz) ? TIMEZONES : [tz, ...TIMEZONES];

  return (
    <form
      className="grid max-w-md gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run({ displayName: name, timezone: tz });
      }}
    >
      <FormField id="profile-name" label="Como quer ser chamado" error={fieldErrors.displayName}>
        <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Opcional" />
      </FormField>
      <FormField
        id="profile-tz"
        label="Fuso horário"
        error={fieldErrors.timezone}
        hint="Define o que é “hoje” para vencimentos, faturas e o mês atual."
      >
        <Select value={tz} onValueChange={setTz}>
          <SelectTrigger id="profile-tz" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {zones.map((z) => (
              <SelectItem key={z} value={z}>
                {z.replace("America/", "").replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </form>
  );
}
