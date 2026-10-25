"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

import { CATEGORY_ICONS, CategoryBadgeIcon } from "@/components/category-icon";
import { CATEGORY_ICON_NAMES } from "@/components/category-icon-names";
import { ColorPicker } from "@/components/color-picker";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORY_KIND_LABEL } from "@/domain/labels";
import { useServerAction } from "@/hooks/use-server-action";
import { categorySchema, type CategoryInput, type CategoryValues } from "@/lib/schemas";
import type { Tables } from "@/lib/db/types";
import { cn } from "@/lib/utils";
import { createCategory, updateCategory } from "@/server/actions/categories";

export function CategoryFormDialog({
  category,
  defaultKind = "expense",
  trigger,
}: {
  category?: Tables<"categories">;
  defaultKind?: CategoryInput["kind"];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const create = useServerAction(createCategory);
  const update = useServerAction(updateCategory);
  const pending = create.pending || update.pending;
  const serverErrors = category ? update.fieldErrors : create.fieldErrors;

  const defaults: CategoryInput = {
    name: category?.name ?? "",
    kind: category?.kind ?? defaultKind,
    icon: (category?.icon as CategoryInput["icon"]) ?? "circle",
    color: category?.color ?? "#64748b",
  };
  const form = useForm<CategoryInput, unknown, CategoryValues>({ resolver: zodResolver(categorySchema), defaultValues: defaults });
  const [icon, color] = useWatch({ control: form.control, name: ["icon", "color"] });
  const err = (key: keyof CategoryInput) => form.formState.errors[key]?.message ?? serverErrors[key];

  const onSubmit = form.handleSubmit(() => {
    const values = form.getValues();
    const done = () => setOpen(false);
    if (category) update.run({ ...values, id: category.id }, { onSuccess: done });
    else create.run(values, { onSuccess: done });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset(defaults);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{category ? "Editar categoria" : "Nova categoria"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <div className="flex items-end gap-3">
            <CategoryBadgeIcon icon={icon} color={color} className="size-10" />
            <FormField id="category-name" label="Nome" error={err("name")} className="flex-1">
              <Input id="category-name" {...form.register("name")} />
            </FormField>
          </div>
          <FormField id="category-kind" label="Tipo" error={err("kind")}>
            <Controller
              control={form.control}
              name="kind"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="category-kind" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_KIND_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
          <FormField id="category-icon" label="Ícone" error={err("icon")}>
            <Controller
              control={form.control}
              name="icon"
              render={({ field }) => (
                <div id="category-icon" role="radiogroup" aria-label="Ícone" className="grid grid-cols-9 gap-1.5">
                  {CATEGORY_ICON_NAMES.map((name) => {
                    const Icon = CATEGORY_ICONS[name];
                    const selected = field.value === name;
                    return (
                      <button
                        key={name}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={name}
                        onClick={() => field.onChange(name)}
                        className={cn(
                          "flex aspect-square items-center justify-center rounded-md border text-muted-foreground transition outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                          selected && "border-foreground/40 bg-accent text-foreground",
                        )}
                      >
                        <Icon className="size-4" />
                      </button>
                    );
                  })}
                </div>
              )}
            />
          </FormField>
          <FormField id="category-color" label="Cor" error={err("color")}>
            <Controller
              control={form.control}
              name="color"
              render={({ field }) => <ColorPicker id="category-color" value={field.value} onChange={field.onChange} />}
            />
          </FormField>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
