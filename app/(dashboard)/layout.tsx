import "@/components/workspace.css"
import { cookies } from "next/headers"
import { AppSidebar } from "@/components/app-sidebar"
import { SidebarProvider } from "@/components/ui/sidebar"

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false"

  return (
    <SidebarProvider defaultOpen={defaultOpen} className="workspace">
      <AppSidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </SidebarProvider>
  )
}
