'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { createClient } from '@/lib/supabase/client'
import { LogOut } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { ComponentType, SVGProps } from 'react'
import { clientLogger } from '@/lib/client-logger'

// Type definition for navigation items
type NavigationItem = {
  name: string
  href: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  badge?: string
}

const navigation: NavigationItem[] = []

export function Sidebar() {
  const [isLoading, setIsLoading] = useState(false)
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
    <div
      className="flex h-full w-64 flex-col border-r border-gray-200 dark:border-slate-700/50 bg-white sidebar-enhanced transition-colors duration-300"
    >
      {/* Logo */}
      <div className="flex h-16 items-center px-6 border-b border-gray-200 dark:border-slate-700/50">
        <Link href="/dashboard" className="flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center">
            <Image
              src="/mark-logo-color.png"
              alt="Company Logo"
              width={1080}
              height={1080}
              className="h-10 w-10 object-contain"
            />
          </div>
          <span className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
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
              className={`
                flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors
                ${isActive
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

      <div className="px-3">
        <Separator />
      </div>

      {/* User section */}
      <div className="p-3 space-y-2">
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
  )
}
