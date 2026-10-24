"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthFormState } from "@/server/actions/auth";

type Field = {
  name: string;
  label: string;
  type: "email" | "password";
  autoComplete: string;
  hint?: string;
};

type Props = {
  title: string;
  description?: string;
  submitLabel: string;
  fields: Field[];
  action: (state: AuthFormState, form: FormData) => Promise<AuthFormState>;
  hidden?: Record<string, string>;
  initialError?: string;
  footer?: React.ReactNode;
};

export function AuthForm({ title, description, submitLabel, fields, action, hidden, initialError, footer }: Props) {
  const [state, formAction, pending] = useActionState(action, { error: initialError });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4" noValidate>
          {hidden &&
            Object.entries(hidden).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
          {fields.map((field) => (
            <div key={field.name} className="grid gap-1.5">
              <Label htmlFor={field.name}>{field.label}</Label>
              <Input
                id={field.name}
                name={field.name}
                type={field.type}
                autoComplete={field.autoComplete}
                defaultValue={field.type === "email" ? state.email : undefined}
                required
                aria-invalid={Boolean(state.error) || undefined}
              />
              {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
            </div>
          ))}

          {state.error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          {state.message && (
            <Alert role="status">
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Aguarde…" : submitLabel}
          </Button>
        </form>
        {footer && <div className="mt-5 text-center text-sm text-muted-foreground">{footer}</div>}
      </CardContent>
    </Card>
  );
}
