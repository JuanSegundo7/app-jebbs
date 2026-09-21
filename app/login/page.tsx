import { LoginForm } from "@/components/auth/login-form"
import { QueryProvider } from "@/components/providers/query-provider"
import { ThemeColorProvider } from "@/components/providers/theme-color-provider"

export default function LoginPage() {
  return (
    <QueryProvider>
      <ThemeColorProvider>
        <LoginForm />
      </ThemeColorProvider>
    </QueryProvider>
  )
}
