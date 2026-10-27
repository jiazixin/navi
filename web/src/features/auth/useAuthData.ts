import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSession, login, logout } from '../../app/api/auth'
import { ApiError } from '../../app/api'

/** Public query keys for session invalidation across application composition. */
export const authKeys = { all: ['auth'] as const, session: () => ['auth', 'session'] as const }

/** Loads and periodically revalidates the browser session. */
export function useAuthData() {
  return useQuery({
    queryKey: authKeys.session(),
    queryFn: ({ signal }) => getSession(signal),
    staleTime: 0,
    retry: false,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })
}

/** Signs in and confirms that the browser accepted the session cookie. */
export function useLogin() {
  const client = useQueryClient()
  const requestSignal = useRequestSignal()
  return useMutation({
    mutationFn: async (credentials: {
      username: FormDataEntryValue | null
      password: FormDataEntryValue | null
    }) => {
      const signal = requestSignal()
      await login(credentials.username, credentials.password, signal)
      const session = await getSession(signal)
      if (!session.authenticated)
        throw new ApiError('browser did not retain the session cookie', {
          status: 0,
          code: 'session_cookie_rejected',
          requestId: '',
        })
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: authKeys.all })
      window.location.replace('/')
    },
  })
}

/** Ends the session; errors remain available for the application notification. */
export function useLogout() {
  const client = useQueryClient()
  const requestSignal = useRequestSignal()
  return useMutation({
    mutationFn: () => logout(requestSignal()),
    onSuccess: () => {
      client.clear()
      window.location.replace('/login')
    },
  })
}

function useRequestSignal() {
  const active = useRef<AbortController | null>(null)
  useEffect(() => () => active.current?.abort(), [])
  return () => {
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    return controller.signal
  }
}
