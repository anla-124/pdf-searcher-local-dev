import { useState, useCallback, useEffect, useRef } from 'react'

interface ColumnWidths {
  [key: string]: number
}

export function useResizableColumns(initialWidths: ColumnWidths) {
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(initialWidths)
  const [isResizing, setIsResizing] = useState(false)
  const [activeColumn, setActiveColumn] = useState<string | null>(null)
  const startXRef = useRef<number>(0)
  const startWidthRef = useRef<number>(0)

  const handleMouseDown = useCallback((e: React.MouseEvent, columnKey: string) => {
    e.preventDefault()
    setIsResizing(true)
    setActiveColumn(columnKey)
    startXRef.current = e.clientX
    startWidthRef.current = columnWidths[columnKey] || 0
  }, [columnWidths])

  useEffect(() => {
    if (!isResizing || !activeColumn) return

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startXRef.current
      const newWidth = Math.max(50, startWidthRef.current + diff) // Minimum width of 50px

      setColumnWidths(prev => ({
        ...prev,
        [activeColumn]: newWidth
      }))
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      setActiveColumn(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, activeColumn])

  return {
    columnWidths,
    handleMouseDown,
    isResizing,
    activeColumn
  }
}
