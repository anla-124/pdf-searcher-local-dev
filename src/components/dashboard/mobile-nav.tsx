'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { clientLogger } from '@/lib/client-logger'
import { 
  Upload, 
  Search, 
  BarChart3, 
  Settings, 
  LogOut, 
  User,
  Home,
  Files,
  Sparkles,
  Menu
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'Upload Documents', href: '/dashboard', icon: Upload },
  { name: 'All Documents', href: '/documents', icon: Files },
  { name: 'Search & Analysis', href: '/dashboard', icon: Search },
  { name: 'Analytics', href: '/dashboard', icon: BarChart3, badge: 'Soon' },
]

export function MobileNav() {
  const [isLoading, setIsLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    setIsLoading(true)
    try {
      await supabase.auth.signOut()
      router.push('/login')
    } catch (error) {
      clientLogger.error('Error logging out', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          className="mr-2 px-0 text-base hover:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 md:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-6 w-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="pl-1 pr-0 w-64">
        <div className="flex h-full w-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center px-6 border-b border-gray-200 dark:border-gray-700">
            <Link href="/dashboard" className="flex items-center space-x-2" onClick={() => setOpen(false)}>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                PDF Searcher
              </span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3 py-4">
            {navigation.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`
                    flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors
                    ${
                      isActive
                        ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-white'
                    }
                  `}
                >
                  <item.icon className={`mr-3 h-5 w-5 ${isActive ? 'text-blue-600 dark:text-blue-400' : ''}`} />
                  {item.name}
                  {item.badge && (
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {item.badge}
                    </Badge>
                  )}
                </Link>
              )
            })}
          </nav>

          <Separator className="mx-3" />

          {/* User section */}
          <div className="p-3 space-y-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-gray-700 dark:text-gray-300"
            >
              <User className="mr-3 h-4 w-4" />
              Profile
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-gray-700 dark:text-gray-300"
            >
              <Settings className="mr-3 h-4 w-4" />
              Settings
            </Button>
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              disabled={isLoading}
              className="w-full justify-start text-gray-700 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400"
            >
              <LogOut className="mr-3 h-4 w-4" />
              {isLoading ? 'Logging out...' : 'Logout'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
