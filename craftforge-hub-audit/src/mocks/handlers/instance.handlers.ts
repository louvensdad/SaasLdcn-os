import { http, HttpResponse, delay } from 'msw'
import type { InstanceResponse } from '@/types/api'

let instances: InstanceResponse[] = [
  {
    id: 'inst-1',
    account_id: 'acc-1',
    account_username: 'jogador1',
    game: 'World of Warcraft',
    status: 'online',
    fps: 60,
    ram_mb: 1200,
    uptime_seconds: 3600,
    macro_running: false,
    created_at: '2024-01-15T10:05:00Z',
  },
  {
    id: 'inst-2',
    account_id: 'acc-2',
    account_username: 'farm_bot_01',
    game: 'RuneScape',
    status: 'offline',
    fps: null,
    ram_mb: null,
    uptime_seconds: null,
    macro_running: false,
    created_at: '2024-02-01T14:35:00Z',
  },
]

export const instanceHandlers = [
  http.get('/instances', async () => {
    await delay(200)
    return HttpResponse.json(instances)
  }),

  http.get('/instances/:id', async ({ params }) => {
    await delay(150)
    const inst = instances.find((i) => i.id === params.id)
    if (!inst) return HttpResponse.json({ detail: 'Instância não encontrada' }, { status: 404 })
    return HttpResponse.json(inst)
  }),

  http.post('/instances/:id/start', async ({ params }) => {
    await delay(800)
    const idx = instances.findIndex((i) => i.id === params.id)
    if (idx === -1) return HttpResponse.json({ detail: 'Instância não encontrada' }, { status: 404 })
    if (instances[idx].status === 'online') {
      return HttpResponse.json({ detail: 'Instância já está em execução.' }, { status: 409 })
    }
    instances[idx] = {
      ...instances[idx],
      status: 'online',
      fps: 60,
      ram_mb: 1200,
      uptime_seconds: 0,
    }
    return HttpResponse.json(instances[idx])
  }),

  http.post('/instances/:id/stop', async ({ params }) => {
    await delay(500)
    const idx = instances.findIndex((i) => i.id === params.id)
    if (idx === -1) return HttpResponse.json({ detail: 'Instância não encontrada' }, { status: 404 })
    if (instances[idx].status === 'offline') {
      return HttpResponse.json({ detail: 'Instância já está offline.' }, { status: 409 })
    }
    instances[idx] = {
      ...instances[idx],
      status: 'offline',
      fps: null,
      ram_mb: null,
      uptime_seconds: null,
    }
    return HttpResponse.json(instances[idx])
  }),

  http.post('/instances/start', async () => {
    await delay(1000)
    const started = 0
    const errors: string[] = []
    instances = instances.map((inst) => {
      if (inst.status === 'offline') {
        return { ...inst, status: 'online', fps: 60, ram_mb: 1200, uptime_seconds: 0 }
      }
      return inst
    })
    return HttpResponse.json({ started: instances.filter((i) => i.status === 'online').length, errors })
  }),

  http.post('/instances/stop', async () => {
    await delay(800)
    instances = instances.map((inst) => ({
      ...inst,
      status: 'offline',
      fps: null,
      ram_mb: null,
      uptime_seconds: null,
      macro_running: false,
    }))
    return HttpResponse.json(null, { status: 204 })
  }),
]