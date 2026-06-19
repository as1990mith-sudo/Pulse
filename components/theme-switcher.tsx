"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Check, Contrast, Layers, Moon, Sun } from "lucide-react"
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
import { cn } from "@/lib/utils"

const themes = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "mid", label: "Mid", icon: Contrast },
  { value: "transparent", label: "Transparent", icon: Layers },
] as const

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const active = themes.find((t) => t.value === theme) ?? themes[1]
  const ActiveIcon = active.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Switch theme">
            {mounted ? <ActiveIcon className="size-4" /> : <Moon className="size-4" />}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Appearance</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {themes.map((t) => {
            const Icon = t.icon
            const isActive = mounted && theme === t.value
            return (
              <DropdownMenuItem
                key={t.value}
                onClick={() => setTheme(t.value)}
                className={cn("gap-2", isActive && "text-primary")}
              >
                <Icon className="size-4" />
                <span className="flex-1">{t.label}</span>
                {isActive ? <Check className="size-4" /> : null}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
