import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PDF Search',
  description: 'Search and analyze your PDF documents with powerful keyword and semantic search',
  icons: {
    icon: '/logo/mark-logo-default.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full">
      <body className="font-sans h-full bg-gray-50 antialiased transition-colors duration-300" suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
