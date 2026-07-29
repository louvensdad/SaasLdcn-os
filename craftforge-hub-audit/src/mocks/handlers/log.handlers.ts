import { http, HttpResponse, delay } from 'msw'
import type { ExecutionLogResponse } from '@/types/api'

const logs: ExecutionLogResponse[] = [
  {
    id: 'log-1',
    instance_id: 'inst-1',
    macro_id: 'macro-1',
    macro_name: 'Auto Farm Coletar',
    account_username: 'jogador1',
    result: 'success',
    output: 'Coletou 250 itens em 30 segundos.',
    error_message: null,
    started_at: '2024-03-10T10:00:00Z',
    finished_at: '2024-03-10T10:00:30Z',
  },
  {
    id: 'log-2',
    instance_id: 'inst-1',
    macro_id: 'macro-2',
    macro_name: 'Anti-AFK',
    account_username: 'jogador1',
    result: 'failure',
    output: null,
    error_message: 'Timeout: jogo não respondeu ao comando de movimento.',
    started_at: '2024-03-10T11:00:00Z',
    finished_at: '2024-03-10T11:01:00Z',
  },
]

export const logHandlers = [
  http.get('/logs', async ({ request }) => {
    await delay(200)
    const url = new URL(request.url)
    const search = url.searchParams.get('search')?.toLowerCase()
    let filtered = logs
    if (search) {
      filtered = filtered.filter(
        (l) =>
          l.macro_name.toLowerCase().includes(search) ||
          l.account_username.toLowerCase().includes(search),
      )
    }
    return HttpResponse.json(filtered)
  }),

  http.get('/logs/:id', async ({ params }) => {
    await delay(150)
    const log = logs.find((l) => l.id === params.id)
    if (!log) return HttpResponse.json({ detail: 'Log não encontrado' }, { status: 404 })
    return HttpResponse.json(log)
  }),
]