import { http, HttpResponse, delay } from 'msw'
import type { UserAdminResponse } from '@/types/api'

const adminUsers: UserAdminResponse[] = [
  {
    id: 'user-1',
    email: 'admin@gamehub.com',
    name: 'Admin Principal',
    role: 'admin',
    plan: 'enterprise',
    instances_limit: 50,
    active_instances: 2,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'user-2',
    email: 'jogador@email.com',
    name: 'João Jogador',
    role: 'user',
    plan: 'pro',
    instances_limit: 10,
    active_instances: 1,
    created_at: '2024-02-01T00:00:00Z',
    updated_at: '2024-02-01T00:00:00Z',
  },
]

export const adminHandlers = [
  http.get('/admin/users', async () => {
    await delay(300)
    return HttpResponse.json(adminUsers)
  }),

  http.get('/admin/users/:id', async ({ params }) => {
    await delay(200)
    const user = adminUsers.find((u) => u.id === params.id)
    if (!user) return HttpResponse.json({ detail: 'Usuário não encontrado' }, { status: 404 })
    return HttpResponse.json(user)
  }),

  http.put('/admin/users/:id', async ({ params, request }) => {
    await delay(400)
    const body = await request.json() as any
    const idx = adminUsers.findIndex((u) => u.id === params.id)
    if (idx === -1) return HttpResponse.json({ detail: 'Usuário não encontrado' }, { status: 404 })
    if (body.instances_limit < adminUsers[idx].active_instances) {
      return HttpResponse.json(
        { detail: 'Valor de limite inválido. Deve ser maior que instâncias ativas atuais.' },
        { status: 422 },
      )
    }
    adminUsers[idx] = { ...adminUsers[idx], ...body, updated_at: new Date().toISOString() }
    return HttpResponse.json(adminUsers[idx])
  }),
]