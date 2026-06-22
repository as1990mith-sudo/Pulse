"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Check, Contrast, Moon, Palette, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SKINS, useSkin } from "@/components/skin-provider"
import { cn } from "@/lib/utils"

const themes = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "mid", label: "Mid", icon: Contrast },
  { value: "light", label: "Light", icon: Sun },
] as const

// Preview swatch per skin — each shows its accent ring gradient.
const SKIN_SWATCH: Record<string, string> = {
  orange: "linear-gradient(to top right, oklch(0.79 0.16 62), oklch(0.66 0.23 22), oklch(0.6 0.26 350))",
  white: "linear-gradient(to top right, oklch(1 0 0), oklch(0.9 0.002 285), oklch(0.78 0.004 285))",
  black: "linear-gradient(to top right, oklch(0.34 0.006 285), oklch(0.22 0.006 285), oklch(0.14 0.006 285))",
}

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  const { skin, setSkin, mounted: skinMounted } = useSkin()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const active = themes.find((t) => t.value === theme) ?? themes[1]
  const ActiveIcon = active.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Switch theme and skin">
            {mounted ? <ActiveIcon className="size-4" /> : <Moon className="size-4" />}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-52 rounded-2xl p-1.5">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Appearance
          </DropdownMenuLabel>
          {themes.map((t) => {
            const Icon = t.icon
            const isActive = mounted && theme === t.value
            return (
              <DropdownMenuItem
                key={t.value}
                onClick={() => setTheme(t.value)}
                className={cn("gap-2.5 rounded-xl py-2", isActive && "text-primary")}
              >
                <Icon className="size-4" />
                <span className="flex-1">{t.label}</span>
                {isActive ? <Check className="size-4" /> : null}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Palette className="size-3.5" />
            Skin
          </DropdownMenuLabel>
          {SKINS.map((s) => {
            const isActive = skinMounted && skin === s.value
            return (
              <DropdownMenuItem
                key={s.value}
                onClick={() => setSkin(s.value)}
                className={cn("gap-2.5 rounded-xl py-2", isActive && "text-primary")}
              >
                <span
                  className="size-4 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
                  style={{ backgroundImage: SKIN_SWATCH[s.value] }}
                  aria-hidden="true"
                />
                <span className="flex-1">{s.label}</span>
                {isActive ? <Check className="size-4" /> : null}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
