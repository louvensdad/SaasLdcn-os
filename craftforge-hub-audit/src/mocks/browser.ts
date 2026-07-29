import { setupWorker } from 'msw/browser'
import { authHandlers } from './handlers/auth.handlers'
import { accountHandlers } from './handlers/account.handlers'
import { instanceHandlers } from './handlers/instance.handlers'
import { macroHandlers } from './handlers/macro.handlers'
import { logHandlers } from './handlers/log.handlers'
import { adminHandlers } from './handlers/admin.handlers'

export const worker = setupWorker(
  ...authHandlers,
  ...accountHandlers,
  ...instanceHandlers,
  ...macroHandlers,
  ...logHandlers,
  ...adminHandlers,
)