import { AlertTriangleIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

/** The API's message for a failed request (bad ticker, infeasible constraint, ...). */
export function QueryError({
  error,
  title = 'Could not compute this',
}: {
  error: Error | null
  title?: string
}) {
  if (!error) return null
  return (
    <Alert variant="error">
      <AlertTriangleIcon aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{error.message}</AlertDescription>
    </Alert>
  )
}
