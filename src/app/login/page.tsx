'use client'

import { GoogleAuthButton, EmailPasswordLogin } from '@/components/auth/oauth-buttons'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Image from 'next/image'
import { useState, useEffect } from 'react'

export default function LoginPage() {
  // Check if we're in local development mode (only on client to avoid hydration mismatch)
  const [isLocalDev, setIsLocalDev] = useState(false)

  useEffect(() => {
    setIsLocalDev(
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    )
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-50 dark:bg-[#0a1329] transition-colors duration-300">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center">
            <Image
              src="/mark-logo-color.png"
              alt="PDF Searcher logo"
              width={1080}
              height={1080}
              className="h-16 w-16 object-contain"
              priority
            />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">PDF Searcher</h1>
        </div>

        <Card className="shadow-xl border-0 bg-white/80 dark:bg-slate-900/90 dark:border-slate-700/50 backdrop-blur-sm">
          <CardHeader className="space-y-1 pb-6">
            <CardTitle className="text-xl text-center text-gray-900 dark:text-white">Welcome to PDF Searcher</CardTitle>
            <CardDescription className="text-center text-gray-600 dark:text-gray-400">
              {isLocalDev
                ? 'Sign in with email or Google to get started'
                : 'Sign in with your Google account to get started'
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLocalDev && (
              <>
                <EmailPasswordLogin />
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-gray-300 dark:border-gray-600" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white dark:bg-gray-900 px-2 text-gray-500 dark:text-gray-400">
                      Or continue with
                    </span>
                  </div>
                </div>
              </>
            )}
            <GoogleAuthButton />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
