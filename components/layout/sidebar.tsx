"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  BarChart3,
  UtensilsCrossed,
  Plus,
  DollarSign,
  Component,
  User,
  LogOut,
  Wallet,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import Image from "next/image";

const navigation = [
  { name: "Pedidos", href: "/", icon: LayoutDashboard },
  { name: "Historial", href: "/historial", icon: ClipboardList },
  { name: "Rendimiento", href: "/rendimiento", icon: BarChart3 },
  { name: "Finanzas", href: "/finanzas", icon: Wallet },
  { name: "Clientes", href: "/clientes", icon: User },
  { name: "Menú", href: "/menu", icon: UtensilsCrossed },
  { name: "Combos", href: "/combos", icon: Component },
  { name: "Extras", href: "/extras", icon: Plus },
  { name: "Precios", href: "/precios", icon: DollarSign },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
  }

  return (
    <Sidebar collapsible="icon" variant="floating" className="ios-sidebar">
      <SidebarHeader className="pb-2">
        <div className="flex items-center gap-3 px-1 py-2 transition-all duration-300 ease-in-out overflow-hidden group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0">
          {/*
            Sin mx-auto en el icono: margin:auto no interpola (es un salto
            discreto, no una animacion -- CSS Transitions no puede
            interpolar hacia/desde la palabra clave "auto"), asi que
            cualquier intento de centrarlo con margen terminaba saltando en
            un punto de la transicion donde la fila todavia tenia ancho de
            sobra, y se veia el texto amontonado contra el icono a mitad de
            camino. El icono se queda quieto a la izquierda todo el tiempo
            -- una imperfeccion cosmetica minima (no queda perfecto al
            centro en modo icono) a cambio de cero saltos.
          */}
          <Image
            src="/jebbs.jpg"
            alt="Logo"
            width={36}
            height={36}
            className="rounded-lg shrink-0 size-9 object-cover"
          />
          {/*
            grid-template-columns 1fr -> 0fr, no max-width -> max-w-0: con
            max-width el ancho real queda pisado en el ancho natural del
            contenido (~80px) mientras el techo (max-w-xs = 320px) todavia
            no lo alcanza, asi que la animacion queda "muerta" la mayor
            parte del tiempo y recien colapsa de golpe al final -- el salto
            raro reportado. El truco de fr-units se achica en proporcion al
            contenido real desde el primer frame, sin zona muerta. La
            opacidad usa la MISMA duracion/easing que el ancho (300ms, sin
            delay) a proposito: si el fade terminara antes o despues que el
            angostamiento, hay una ventana donde el texto se ve recortado
            pero todavia bien visible, amontonado contra el icono.
          */}
          <div className="grid grid-cols-[1fr] transition-[grid-template-columns] duration-300 ease-in-out group-data-[collapsible=icon]:grid-cols-[0fr]">
            <div
              className={cn(
                // leading-tight deliberado: stack de 2 lineas (Jebbs / Burgers),
                // el leading normal de headline/subheadline las separa de mas.
                "flex flex-col leading-tight overflow-hidden min-w-0",
                "transition-opacity duration-300 ease-in-out opacity-100",
                "group-data-[collapsible=icon]:opacity-0",
              )}
            >
              <span className="text-headline font-bold whitespace-nowrap">
                Jebbs
              </span>
              <span
                className="font-brand text-subheadline text-(--color-jebbs) -mt-1 whitespace-nowrap"
                style={{ textShadow: "0 0 12px color-mix(in srgb, var(--jebbs) 55%, transparent)" }}
              >
                Burgers
              </span>
            </div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.name}
                      className={cn(
                        "rounded-lg transition-all duration-200 h-9",
                        isActive
                          ? "nav-rail-active bg-primary/10 text-primary font-medium"
                          : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                      )}
                    >
                      <Link href={item.href}>
                        <item.icon className={cn("size-4 shrink-0", isActive && "text-primary")} />
                        <span className="text-subheadline">{item.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="pb-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleLogout}
              tooltip="Cerrar sesión"
              className="rounded-lg transition-all duration-200 h-9 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent cursor-pointer"
            >
              <LogOut className="size-4 shrink-0" />
              <span className="text-subheadline">Cerrar sesión</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
