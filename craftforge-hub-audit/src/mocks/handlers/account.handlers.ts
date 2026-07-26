import { http, HttpResponse, delay } from 'msw'
import type { AccountResponse } from '@/types/api'

let accounts: AccountResponse[] = [
  {
    id: 'acc-1',
    user_id: 'user-1',
    username: 'jogador1',
    game: 'World of Warcraft',
    status: 'active',
    created_at: '2024-01-15T10:00:00Z',
  },
  {
    id: 'acc-2',
    user_id: 'user-1',
    username: 'farm_bot_01',
    game: 'RuneScape',
    status: 'active',
    created_at: '2024-02-01T14:30:00Z',
  },
]

export const accountHandlers = [
  http.get('/accounts', async () => {
    await delay(200)
    return HttpResponse.json(accounts)
  }),

  http.get('/accounts/:id', async ({ params }) => {
    await delay(150)
    const acc = accounts.find((a) => a.id === params.id)
    if (!acc) return HttpResponse.json({ detail: 'Conta não encontrada' }, { status: 404 })
    return HttpResponse.json(acc)
  }),

  http.post('/accounts', async ({ request }) => {
    await delay(400)
    const body = await request.json() as any
    if (!body.username || !body.password || !body.game) {
      return HttpResponse.json(
        { detail: 'Falha ao validar credenciais: verifique usuário e senha.' },
        { status: 422 },
      )
    }
    const newAcc: AccountResponse = {
      id: `acc-${Date.now()}`,
      user_id: 'user-1',
      username: body.username,
      game: body.game,
      status: 'active',
      created_at: new Date().toISOString(),
    }
    accounts.push(newAcc)
    return HttpResponse.json(newAcc, { status: 201 })
  }),

  http.put('/accounts/:id', async ({ params, request }) => {
    await delay(300)
    const body = await request.json() as any
    const idx = accounts.findIndex((a) => a.id === params.id)
    if (idx === -1) return HttpResponse.json({ detail: 'Conta não encontrada' }, { status: 404 })
    accounts[idx] = { ...accounts[idx], ...body }
    return HttpResponse.json(accounts[idx])
  }),

  http.delete('/accounts/:id', async ({ params }) => {
    await delay(200)
    accounts = accounts.filter((a) => a.id !== params.id)
    return HttpResponse.json(null, { status: 204 })
  }),
]