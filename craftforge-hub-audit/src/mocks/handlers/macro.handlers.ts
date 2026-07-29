import { http, HttpResponse, delay } from 'msw'
import type { MacroResponse } from '@/types/api'

let macros: MacroResponse[] = [
  {
    id: 'macro-1',
    user_id: 'user-1',
    name: 'Auto Farm Coletar',
    script: '// Coleta automática\nwhile true { collect(); wait(5000); }',
    created_at: '2024-03-01T08:00:00Z',
    updated_at: '2024-03-01T08:00:00Z',
  },
  {
    id: 'macro-2',
    user_id: 'user-1',
    name: 'Anti-AFK',
    script: '// Movimento anti-AFK\nmove_random(); wait(60000);',
    created_at: '2024-03-05T12:00:00Z',
    updated_at: '2024-03-05T12:00:00Z',
  },
]

export const macroHandlers = [
  http.get('/macros', async () => {
    await delay(200)
    return HttpResponse.json(macros)
  }),

  http.get('/macros/:id', async ({ params }) => {
    await delay(150)
    const macro = macros.find((m) => m.id === params.id)
    if (!macro) return HttpResponse.json({ detail: 'Macro não encontrada' }, { status: 404 })
    return HttpResponse.json(macro)
  }),

  http.post('/macros', async ({ request }) => {
    await delay(400)
    const body = await request.json() as any
    if (!body.name || !body.script) {
      return HttpResponse.json({ detail: 'Nome e script são obrigatórios' }, { status: 422 })
    }
    const newMacro: MacroResponse = {
      id: `macro-${Date.now()}`,
      user_id: 'user-1',
      name: body.name,
      script: body.script,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    macros.push(newMacro)
    return HttpResponse.json(newMacro, { status: 201 })
  }),

  http.put('/macros/:id', async ({ params, request }) => {
    await delay(300)
    const body = await request.json() as any
    const idx = macros.findIndex((m) => m.id === params.id)
    if (idx === -1) return HttpResponse.json({ detail: 'Macro não encontrada' }, { status: 404 })
    macros[idx] = { ...macros[idx], ...body, updated_at: new Date().toISOString() }
    return HttpResponse.json(macros[idx])
  }),

  http.delete('/macros/:id', async ({ params }) => {
    await delay(200)
    macros = macros.filter((m) => m.id !== params.id)
    return HttpResponse.json(null, { status: 204 })
  }),

  http.post('/macros/:id/associate', async () => {
    await delay(300)
    return HttpResponse.json(null, { status: 204 })
  }),

  http.post('/macros/:id/execute', async () => {
    await delay(1500)
    return HttpResponse.json({ execution_log_id: `log-${Date.now()}` })
  }),
]